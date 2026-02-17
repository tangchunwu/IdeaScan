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
                await page.goto(search_url, wait_until="domcontentloaded", timeout=35000)
                await page.wait_for_timeout(2500)

                raw_notes = await page.evaluate(
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

                for idx, item in enumerate(list(raw_notes or [])[: payload.limits.notes]):
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    note_id = _extract_id_from_url(url, r"/explore/([^/?]+)")
                    note_page = await context.new_page()
                    try:
                        await note_page.goto(url, wait_until="domcontentloaded", timeout=35000)
                        await note_page.wait_for_timeout(1500)
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
                        note = CrawlerNormalizedNote(
                            id=note_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or ""),
                            liked_count=0,
                            comments_count=len((detail or {}).get("comments") or []),
                            collected_count=0,
                            published_at=None,
                            platform="xiaohongshu",
                            url=url,
                        )
                        notes.append(note)

                        for idx, content in enumerate(list((detail or {}).get("comments") or [])):
                            comments.append(
                                CrawlerNormalizedComment(
                                    id=f"{note_id}-c-{idx}",
                                    content=str(content),
                                    like_count=0,
                                    user_nickname="",
                                    ip_location="",
                                    published_at=None,
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
                await page.goto(search_url, wait_until="domcontentloaded", timeout=35000)
                await page.wait_for_timeout(2500)

                raw_notes = await page.evaluate(
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

                for idx, item in enumerate(list(raw_notes or [])[: payload.limits.notes]):
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    video_id = _extract_id_from_url(url, r"/video/([^/?]+)")
                    note_page = await context.new_page()
                    try:
                        await note_page.goto(url, wait_until="domcontentloaded", timeout=35000)
                        await note_page.wait_for_timeout(1200)
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
                        note = CrawlerNormalizedNote(
                            id=video_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or ""),
                            liked_count=0,
                            comments_count=len((detail or {}).get("comments") or []),
                            collected_count=0,
                            published_at=None,
                            platform="douyin",
                            url=url,
                        )
                        notes.append(note)

                        for idx, content in enumerate(list((detail or {}).get("comments") or [])):
                            comments.append(
                                CrawlerNormalizedComment(
                                    id=f"{video_id}-c-{idx}",
                                    content=str(content),
                                    like_count=0,
                                    user_nickname="",
                                    ip_location="",
                                    published_at=None,
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
