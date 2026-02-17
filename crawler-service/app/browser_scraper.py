from __future__ import annotations

import asyncio
import random
import re
import time
from typing import Any, Dict, List, Tuple
from urllib.parse import quote

from app.config import settings
from app.models import CrawlerJobPayload, CrawlerNormalizedComment, CrawlerNormalizedNote, CrawlerPlatformResult

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    async_playwright = None
    PLAYWRIGHT_AVAILABLE = False


def _default_domain(platform: str) -> str:
    if platform == "douyin":
        return ".douyin.com"
    return ".xiaohongshu.com"


def _normalize_cookies(platform: str, cookies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for raw in cookies:
        name = str(raw.get("name", "")).strip()
        value = str(raw.get("value", "")).strip()
        if not name:
            continue
        item: Dict[str, Any] = {
            "name": name,
            "value": value,
            "domain": str(raw.get("domain") or _default_domain(platform)),
            "path": str(raw.get("path") or "/"),
        }
        if "expires" in raw and raw.get("expires") is not None:
            try:
                item["expires"] = float(raw["expires"])
            except Exception:
                pass
        if "httpOnly" in raw:
            item["httpOnly"] = bool(raw.get("httpOnly"))
        if "secure" in raw:
            item["secure"] = bool(raw.get("secure"))
        normalized.append(item)
    return normalized


def _extract_id_from_url(url: str, pattern: str) -> str:
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return url.rstrip("/").split("/")[-1]


def _delay_range_ms(mode: str) -> tuple[int, int]:
    if mode == "deep":
        lo = int(settings.crawler_deep_delay_ms_min)
        hi = int(settings.crawler_deep_delay_ms_max)
    else:
        lo = int(settings.crawler_quick_delay_ms_min)
        hi = int(settings.crawler_quick_delay_ms_max)
    if lo <= 0 and hi <= 0:
        return (0, 0)
    if lo <= 0:
        lo = hi
    if hi < lo:
        hi = lo
    return (lo, hi)


async def _human_delay(mode: str) -> None:
    lo, hi = _delay_range_ms(mode)
    if lo <= 0 and hi <= 0:
        return
    await asyncio.sleep(random.uniform(lo, hi) / 1000)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _walk_json_nodes(root: Any, max_nodes: int = 4000) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []
    stack: List[Any] = [root]
    visited = 0
    while stack and visited < max_nodes:
        node = stack.pop()
        visited += 1
        if isinstance(node, dict):
            found.append(node)
            for v in node.values():
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, (dict, list)):
                    stack.append(item)
    return found


def _extract_note_candidates_from_payload(payload: Any, platform: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    seen: set[str] = set()
    for obj in _walk_json_nodes(payload):
        nid = ""
        if platform == "xiaohongshu":
            nid = str(obj.get("note_id") or obj.get("id") or "").strip()
        else:
            nid = str(obj.get("aweme_id") or obj.get("id") or "").strip()
        title = str(obj.get("title") or obj.get("name") or obj.get("desc") or "").strip()
        desc = str(obj.get("desc") or obj.get("content") or "").strip()
        url = str(obj.get("url") or obj.get("jump_url") or obj.get("share_url") or "").strip()
        if not url and nid:
            url = (
                f"https://www.xiaohongshu.com/explore/{nid}"
                if platform == "xiaohongshu"
                else f"https://www.douyin.com/video/{nid}"
            )
        if not url:
            continue
        uniq = f"{nid}|{url}"
        if uniq in seen:
            continue
        seen.add(uniq)
        rows.append({
            "id": nid or _extract_id_from_url(url, r"/([^/?]+)$"),
            "url": url,
            "title": title[:80] if title else desc[:80],
            "desc": desc[:1000],
        })
        if len(rows) >= 80:
            break
    return rows


def _extract_comment_candidates_from_payload(payload: Any, platform: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for obj in _walk_json_nodes(payload):
        content = str(obj.get("content") or obj.get("text") or obj.get("comment_text") or "").strip()
        if len(content) < 6 or len(content) > 350:
            continue
        uniq = content[:180]
        if uniq in seen:
            continue
        seen.add(uniq)
        user = obj.get("user") if isinstance(obj.get("user"), dict) else {}
        nickname = str(obj.get("user_nickname") or user.get("nickname") or user.get("nick_name") or "").strip()
        rows.append({
            "id": str(obj.get("cid") or obj.get("id") or obj.get("comment_id") or "").strip(),
            "content": content,
            "like_count": _safe_int(obj.get("like_count") or obj.get("digg_count") or obj.get("liked_count"), 0),
            "user_nickname": nickname,
            "ip_location": str(obj.get("ip_location") or obj.get("ip_label") or "").strip(),
            "published_at": str(obj.get("create_time") or obj.get("time") or obj.get("publish_time") or "").strip() or None,
            "platform": platform,
        })
        if len(rows) >= 400:
            break
    return rows


def _merge_note_sources(dom_rows: List[Dict[str, str]], api_rows: List[Dict[str, str]], max_notes: int) -> List[Dict[str, str]]:
    merged: List[Dict[str, str]] = []
    seen: set[str] = set()
    for row in dom_rows + api_rows:
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        if url in seen:
            continue
        seen.add(url)
        merged.append({
            "id": str(row.get("id") or ""),
            "url": url,
            "title": str(row.get("title") or "")[:80],
            "desc": str(row.get("desc") or "")[:1000],
        })
        if len(merged) >= max_notes:
            break
    return merged


async def _crawl_xiaohongshu(
    payload: CrawlerJobPayload,
    session: Dict[str, Any],
) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
    started = time.time()
    notes: List[CrawlerNormalizedNote] = []
    comments: List[CrawlerNormalizedComment] = []
    proxy_calls = 0

    assert async_playwright is not None
    playwright = await async_playwright().start()
    try:
        proxy = None
        if settings.crawler_default_proxy_server:
            proxy = {"server": settings.crawler_default_proxy_server}
            if settings.crawler_default_proxy_username:
                proxy["username"] = settings.crawler_default_proxy_username
            if settings.crawler_default_proxy_password:
                proxy["password"] = settings.crawler_default_proxy_password
            proxy_calls = 1

        browser = await playwright.chromium.launch(
            headless=settings.crawler_playwright_headless,
            proxy=proxy,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            ua = str(session.get("user_agent") or settings.crawler_user_agent_pool.split(",")[0].strip() or "Mozilla/5.0")
            context = await browser.new_context(user_agent=ua)
            try:
                cookies = _normalize_cookies("xiaohongshu", list(session.get("cookies") or []))
                if cookies:
                    await context.add_cookies(cookies)

                page = await context.new_page()
                search_url = f"https://www.xiaohongshu.com/search_result?keyword={quote(payload.query)}&source=web_explore_feed"
                search_api_notes: List[Dict[str, str]] = []
                search_capture_tasks: List[asyncio.Task[Any]] = []

                async def capture_search_response(response: Any) -> None:
                    url = str(getattr(response, "url", "")).lower()
                    if "search" not in url and "note" not in url and "feed" not in url:
                        return
                    try:
                        raw = await response.json()
                    except Exception:
                        return
                    search_api_notes.extend(_extract_note_candidates_from_payload(raw, "xiaohongshu"))

                def on_search_response(response: Any) -> None:
                    search_capture_tasks.append(asyncio.create_task(capture_search_response(response)))

                page.on("response", on_search_response)
                await page.goto(search_url, wait_until="domcontentloaded", timeout=35000)
                await page.wait_for_timeout(2000)
                for _ in range(2 if payload.mode == "quick" else 3):
                    await page.mouse.wheel(0, 1800)
                    await page.wait_for_timeout(700)
                if search_capture_tasks:
                    await asyncio.gather(*search_capture_tasks, return_exceptions=True)

                dom_notes = await page.evaluate(
                    """
                    () => {
                      const rows = [];
                      const seen = new Set();
                      const anchors = Array.from(document.querySelectorAll('a[href*="/explore/"]'));
                      for (const a of anchors) {
                        const href = (a.getAttribute('href') || '').trim();
                        if (!href) continue;
                        const url = href.startsWith('http') ? href : `https://www.xiaohongshu.com${href}`;
                        if (seen.has(url)) continue;
                        seen.add(url);
                        const titleNode = a.querySelector('h3,h4,p,span,div');
                        const title = ((titleNode && titleNode.textContent) || a.textContent || '').trim();
                        rows.push({ url, title: title.slice(0, 80) });
                        if (rows.length >= 60) break;
                      }
                      return rows;
                    }
                    """
                )
                note_candidates = _merge_note_sources(
                    list(dom_notes or []),
                    search_api_notes,
                    payload.limits.notes,
                )

                for idx, item in enumerate(note_candidates):
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    note_id = str((item or {}).get("id") or "") or _extract_id_from_url(url, r"/explore/([^/?]+)")
                    note_page = await context.new_page()
                    try:
                        note_api_comments: List[Dict[str, Any]] = []
                        note_capture_tasks: List[asyncio.Task[Any]] = []

                        async def capture_note_response(response: Any) -> None:
                            resp_url = str(getattr(response, "url", "")).lower()
                            if "comment" not in resp_url and "note" not in resp_url and "feed" not in resp_url:
                                return
                            try:
                                raw = await response.json()
                            except Exception:
                                return
                            note_api_comments.extend(_extract_comment_candidates_from_payload(raw, "xiaohongshu"))

                        def on_note_response(response: Any) -> None:
                            note_capture_tasks.append(asyncio.create_task(capture_note_response(response)))

                        note_page.on("response", on_note_response)
                        await note_page.goto(url, wait_until="domcontentloaded", timeout=35000)
                        await note_page.wait_for_timeout(1200)
                        for _ in range(2 if payload.mode == "quick" else 4):
                            await note_page.mouse.wheel(0, 1600)
                            await note_page.wait_for_timeout(650)
                        if note_capture_tasks:
                            await asyncio.gather(*note_capture_tasks, return_exceptions=True)
                        detail = await note_page.evaluate(
                            f"""
                            (maxComments) => {{
                              const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
                              const articleText = (document.querySelector('article')?.innerText || '').trim();
                              const desc = (metaDesc || articleText || '').slice(0, 1000);
                              const candidates = Array.from(document.querySelectorAll('[class*="comment"], [class*="Comment"], p, span, div'))
                                .map(el => (el.textContent || '').trim())
                                .filter(t => t.length >= 6 && t.length <= 120);
                              const uniq = [];
                              const seen = new Set();
                              for (const c of candidates) {{
                                if (seen.has(c)) continue;
                                seen.add(c);
                                uniq.push(c);
                                if (uniq.length >= maxComments) break;
                              }}
                              return {{ desc, comments: uniq }};
                            }}
                            """,
                            payload.limits.comments_per_note,
                        )
                        merged_comments: List[Dict[str, Any]] = []
                        seen_comment: set[str] = set()
                        for c in note_api_comments:
                            text = str(c.get("content") or "").strip()
                            if len(text) < 6:
                                continue
                            key = text[:180]
                            if key in seen_comment:
                                continue
                            seen_comment.add(key)
                            merged_comments.append(c)
                            if len(merged_comments) >= payload.limits.comments_per_note:
                                break
                        if len(merged_comments) < payload.limits.comments_per_note:
                            for raw_content in list((detail or {}).get("comments") or []):
                                text = str(raw_content or "").strip()
                                if len(text) < 6:
                                    continue
                                key = text[:180]
                                if key in seen_comment:
                                    continue
                                seen_comment.add(key)
                                merged_comments.append({
                                    "id": "",
                                    "content": text,
                                    "like_count": 0,
                                    "user_nickname": "",
                                    "ip_location": "",
                                    "published_at": None,
                                    "platform": "xiaohongshu",
                                })
                                if len(merged_comments) >= payload.limits.comments_per_note:
                                    break
                        note = CrawlerNormalizedNote(
                            id=note_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or (item or {}).get("desc") or ""),
                            liked_count=0,
                            comments_count=len(merged_comments),
                            collected_count=0,
                            published_at=None,
                            platform="xiaohongshu",
                            url=url,
                        )
                        notes.append(note)

                        for comment_idx, comment_item in enumerate(merged_comments):
                            comments.append(
                                CrawlerNormalizedComment(
                                    id=str(comment_item.get("id") or f"{note_id}-c-{comment_idx}"),
                                    content=str(comment_item.get("content") or ""),
                                    like_count=_safe_int(comment_item.get("like_count"), 0),
                                    user_nickname=str(comment_item.get("user_nickname") or ""),
                                    ip_location=str(comment_item.get("ip_location") or ""),
                                    published_at=comment_item.get("published_at"),
                                    platform="xiaohongshu",
                                    parent_id=note_id,
                                )
                            )
                    finally:
                        await note_page.close()

            finally:
                await context.close()
        finally:
            await browser.close()
    finally:
        await playwright.stop()

    success = len(notes) > 0
    return (
        CrawlerPlatformResult(
            platform="xiaohongshu",
            notes=notes,
            comments=comments,
            success=success,
            latency_ms=int((time.time() - started) * 1000),
            error=None if success else "session_crawl_empty",
        ),
        {
            "external_api_calls": 0.0,
            "proxy_calls": float(proxy_calls),
            "est_cost": 0.0,
            "provider_mix": {"xiaohongshu_session": 1.0 if success else 0.0},
        },
    )


async def _crawl_douyin(
    payload: CrawlerJobPayload,
    session: Dict[str, Any],
) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
    started = time.time()
    notes: List[CrawlerNormalizedNote] = []
    comments: List[CrawlerNormalizedComment] = []
    proxy_calls = 0

    assert async_playwright is not None
    playwright = await async_playwright().start()
    try:
        proxy = None
        if settings.crawler_default_proxy_server:
            proxy = {"server": settings.crawler_default_proxy_server}
            if settings.crawler_default_proxy_username:
                proxy["username"] = settings.crawler_default_proxy_username
            if settings.crawler_default_proxy_password:
                proxy["password"] = settings.crawler_default_proxy_password
            proxy_calls = 1

        browser = await playwright.chromium.launch(
            headless=settings.crawler_playwright_headless,
            proxy=proxy,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            ua = str(session.get("user_agent") or settings.crawler_user_agent_pool.split(",")[0].strip() or "Mozilla/5.0")
            context = await browser.new_context(user_agent=ua)
            try:
                cookies = _normalize_cookies("douyin", list(session.get("cookies") or []))
                if cookies:
                    await context.add_cookies(cookies)

                page = await context.new_page()
                search_url = f"https://www.douyin.com/search/{quote(payload.query)}?type=video"
                search_api_notes: List[Dict[str, str]] = []
                search_capture_tasks: List[asyncio.Task[Any]] = []

                async def capture_search_response(response: Any) -> None:
                    url = str(getattr(response, "url", "")).lower()
                    if "search" not in url and "aweme" not in url and "video" not in url and "feed" not in url:
                        return
                    try:
                        raw = await response.json()
                    except Exception:
                        return
                    search_api_notes.extend(_extract_note_candidates_from_payload(raw, "douyin"))

                def on_search_response(response: Any) -> None:
                    search_capture_tasks.append(asyncio.create_task(capture_search_response(response)))

                page.on("response", on_search_response)
                await page.goto(search_url, wait_until="domcontentloaded", timeout=35000)
                await page.wait_for_timeout(2000)
                for _ in range(2 if payload.mode == "quick" else 3):
                    await page.mouse.wheel(0, 1800)
                    await page.wait_for_timeout(700)
                if search_capture_tasks:
                    await asyncio.gather(*search_capture_tasks, return_exceptions=True)

                dom_notes = await page.evaluate(
                    """
                    () => {
                      const rows = [];
                      const seen = new Set();
                      const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
                      for (const a of anchors) {
                        const href = (a.getAttribute('href') || '').trim();
                        if (!href) continue;
                        const url = href.startsWith('http') ? href : `https://www.douyin.com${href}`;
                        if (seen.has(url)) continue;
                        seen.add(url);
                        const title = (a.textContent || '').trim().slice(0, 80);
                        rows.push({ url, title });
                        if (rows.length >= 60) break;
                      }
                      return rows;
                    }
                    """
                )
                note_candidates = _merge_note_sources(
                    list(dom_notes or []),
                    search_api_notes,
                    payload.limits.notes,
                )

                for idx, item in enumerate(note_candidates):
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    video_id = str((item or {}).get("id") or "") or _extract_id_from_url(url, r"/video/([^/?]+)")
                    note_page = await context.new_page()
                    try:
                        note_api_comments: List[Dict[str, Any]] = []
                        note_capture_tasks: List[asyncio.Task[Any]] = []

                        async def capture_note_response(response: Any) -> None:
                            resp_url = str(getattr(response, "url", "")).lower()
                            if "comment" not in resp_url and "aweme" not in resp_url and "video" not in resp_url:
                                return
                            try:
                                raw = await response.json()
                            except Exception:
                                return
                            note_api_comments.extend(_extract_comment_candidates_from_payload(raw, "douyin"))

                        def on_note_response(response: Any) -> None:
                            note_capture_tasks.append(asyncio.create_task(capture_note_response(response)))

                        note_page.on("response", on_note_response)
                        await note_page.goto(url, wait_until="domcontentloaded", timeout=35000)
                        await note_page.wait_for_timeout(1200)
                        for _ in range(2 if payload.mode == "quick" else 4):
                            await note_page.mouse.wheel(0, 1600)
                            await note_page.wait_for_timeout(650)
                        if note_capture_tasks:
                            await asyncio.gather(*note_capture_tasks, return_exceptions=True)
                        detail = await note_page.evaluate(
                            """
                            (maxComments) => {
                              const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
                              const pageText = (document.body?.innerText || '').trim();
                              const desc = (metaDesc || pageText || '').slice(0, 1000);
                              const commentNodes = Array.from(document.querySelectorAll('[data-e2e*="comment"], [class*="comment"], p, span, div'))
                                .map(el => (el.textContent || '').trim())
                                .filter(t => t.length >= 6 && t.length <= 120);
                              const uniq = [];
                              const seen = new Set();
                              for (const c of commentNodes) {
                                if (seen.has(c)) continue;
                                seen.add(c);
                                uniq.push(c);
                                if (uniq.length >= maxComments) break;
                              }
                              return { desc, comments: uniq };
                            }
                            """,
                            payload.limits.comments_per_note,
                        )
                        merged_comments: List[Dict[str, Any]] = []
                        seen_comment: set[str] = set()
                        for c in note_api_comments:
                            text = str(c.get("content") or "").strip()
                            if len(text) < 6:
                                continue
                            key = text[:180]
                            if key in seen_comment:
                                continue
                            seen_comment.add(key)
                            merged_comments.append(c)
                            if len(merged_comments) >= payload.limits.comments_per_note:
                                break
                        if len(merged_comments) < payload.limits.comments_per_note:
                            for raw_content in list((detail or {}).get("comments") or []):
                                text = str(raw_content or "").strip()
                                if len(text) < 6:
                                    continue
                                key = text[:180]
                                if key in seen_comment:
                                    continue
                                seen_comment.add(key)
                                merged_comments.append({
                                    "id": "",
                                    "content": text,
                                    "like_count": 0,
                                    "user_nickname": "",
                                    "ip_location": "",
                                    "published_at": None,
                                    "platform": "douyin",
                                })
                                if len(merged_comments) >= payload.limits.comments_per_note:
                                    break
                        note = CrawlerNormalizedNote(
                            id=video_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or (item or {}).get("desc") or ""),
                            liked_count=0,
                            comments_count=len(merged_comments),
                            collected_count=0,
                            published_at=None,
                            platform="douyin",
                            url=url,
                        )
                        notes.append(note)

                        for comment_idx, comment_item in enumerate(merged_comments):
                            comments.append(
                                CrawlerNormalizedComment(
                                    id=str(comment_item.get("id") or f"{video_id}-c-{comment_idx}"),
                                    content=str(comment_item.get("content") or ""),
                                    like_count=_safe_int(comment_item.get("like_count"), 0),
                                    user_nickname=str(comment_item.get("user_nickname") or ""),
                                    ip_location=str(comment_item.get("ip_location") or ""),
                                    published_at=comment_item.get("published_at"),
                                    platform="douyin",
                                    parent_id=video_id,
                                )
                            )
                    finally:
                        await note_page.close()
            finally:
                await context.close()
        finally:
            await browser.close()
    finally:
        await playwright.stop()

    success = len(notes) > 0
    return (
        CrawlerPlatformResult(
            platform="douyin",
            notes=notes,
            comments=comments,
            success=success,
            latency_ms=int((time.time() - started) * 1000),
            error=None if success else "session_crawl_empty",
        ),
        {
            "external_api_calls": 0.0,
            "proxy_calls": float(proxy_calls),
            "est_cost": 0.0,
            "provider_mix": {"douyin_session": 1.0 if success else 0.0},
        },
    )


async def crawl_with_user_session(
    platform: str,
    payload: CrawlerJobPayload,
    session: Dict[str, Any],
) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
    if not PLAYWRIGHT_AVAILABLE:
        return (
            CrawlerPlatformResult(
                platform=platform,
                success=False,
                error="playwright_not_installed",
                latency_ms=0,
            ),
            {"external_api_calls": 0.0, "proxy_calls": 0.0, "est_cost": 0.0, "provider_mix": {f"{platform}_session": 0.0}},
        )
    if platform == "xiaohongshu":
        return await _crawl_xiaohongshu(payload, session)
    if platform == "douyin":
        return await _crawl_douyin(payload, session)
    return (
        CrawlerPlatformResult(platform=platform, success=False, error="unsupported_platform", latency_ms=0),
        {"external_api_calls": 0.0, "proxy_calls": 0.0, "est_cost": 0.0, "provider_mix": {f"{platform}_session": 0.0}},
    )
