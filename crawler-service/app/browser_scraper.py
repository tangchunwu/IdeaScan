from __future__ import annotations

import asyncio
import ctypes
import hashlib
import json
import random
import re
import time
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse

from app.config import settings
from app.models import CrawlerJobPayload, CrawlerNormalizedComment, CrawlerNormalizedNote, CrawlerPlatformResult

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    async_playwright = None
    PLAYWRIGHT_AVAILABLE = False


COMMENT_MIN_CHARS = 2
COMMENT_MAX_CHARS = 350
XHS_BASE64_CHARS = list("ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5")
XHS_EDITH_HOST = "https://edith.xiaohongshu.com"
XHS_COMMENT_PAGE_URIS = [
    "/api/sns/web/v2/comment/page",
    "/api/sns/web/v1/comment/page",
    "/api/sns/web/v1/note/comment/page",
]


def _xhs_build_crc32_table() -> List[int]:
    table: List[int] = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = (0xEDB88320 ^ (c >> 1)) if (c & 1) else (c >> 1)
        table.append(c & 0xFFFFFFFF)
    return table


XHS_CRC32_TABLE = _xhs_build_crc32_table()


def _xhs_right_shift_unsigned(num: int, bit: int = 0) -> int:
    val = ctypes.c_uint32(num).value >> bit
    max32 = 4294967295
    return (val + (max32 + 1)) % (2 * (max32 + 1)) - max32 - 1


def _xhs_mrc(value: str) -> int:
    acc = -1
    for idx in range(min(57, len(value))):
        acc = XHS_CRC32_TABLE[(acc & 255) ^ ord(value[idx])] ^ _xhs_right_shift_unsigned(acc, 8)
    return acc ^ -1 ^ 3988292384


def _xhs_encode_utf8(value: str) -> List[int]:
    encoded = quote(value, safe="~()*!.'")
    result: List[int] = []
    pos = 0
    while pos < len(encoded):
        if encoded[pos] == "%":
            result.append(int(encoded[pos + 1:pos + 3], 16))
            pos += 3
        else:
            result.append(ord(encoded[pos]))
            pos += 1
    return result


def _xhs_triplet_to_base64(value: int) -> str:
    return (
        XHS_BASE64_CHARS[(value >> 18) & 63]
        + XHS_BASE64_CHARS[(value >> 12) & 63]
        + XHS_BASE64_CHARS[(value >> 6) & 63]
        + XHS_BASE64_CHARS[value & 63]
    )


def _xhs_encode_chunk(data: List[int], start: int, end: int) -> str:
    out: List[str] = []
    for idx in range(start, end, 3):
        packed = ((data[idx] << 16) & 0xFF0000) + ((data[idx + 1] << 8) & 0xFF00) + (data[idx + 2] & 0xFF)
        out.append(_xhs_triplet_to_base64(packed))
    return "".join(out)


def _xhs_b64_encode(data: List[int]) -> str:
    length = len(data)
    remainder = length % 3
    chunks: List[str] = []
    main_len = length - remainder

    for idx in range(0, main_len, 16383):
        chunks.append(_xhs_encode_chunk(data, idx, min(idx + 16383, main_len)))

    if remainder == 1:
        val = data[length - 1]
        chunks.append(XHS_BASE64_CHARS[val >> 2] + XHS_BASE64_CHARS[(val << 4) & 63] + "==")
    elif remainder == 2:
        val = (data[length - 2] << 8) + data[length - 1]
        chunks.append(
            XHS_BASE64_CHARS[val >> 10]
            + XHS_BASE64_CHARS[(val >> 4) & 63]
            + XHS_BASE64_CHARS[(val << 2) & 63]
            + "="
        )

    return "".join(chunks)


def _xhs_trace_id() -> str:
    return "".join(random.choice("abcdef0123456789") for _ in range(16))


def _xhs_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _xhs_build_sign_string(uri: str, data: Any, method: str) -> str:
    method = method.upper()
    if method == "POST":
        if data is None:
            return uri
        if isinstance(data, str):
            return uri + data
        return uri + _xhs_json_dumps(data)

    if not data:
        return uri
    if isinstance(data, str):
        return f"{uri}?{data}"
    if not isinstance(data, dict):
        return uri

    params: List[str] = []
    for key in data.keys():
        raw_val = data.get(key)
        if isinstance(raw_val, list):
            val = ",".join(str(item) for item in raw_val)
        elif raw_val is None:
            val = ""
        else:
            val = str(raw_val)
        params.append(f"{key}={quote(val, safe='')}")
    if not params:
        return uri
    return f"{uri}?{'&'.join(params)}"


def _xhs_build_xs_payload(x3_value: str, data_type: str = "object") -> str:
    payload = {
        "x0": "4.2.1",
        "x1": "xhs-pc-web",
        "x2": "Mac OS",
        "x3": x3_value,
        "x4": data_type,
    }
    return "XYS_" + _xhs_b64_encode(_xhs_encode_utf8(_xhs_json_dumps(payload)))


def _xhs_build_xs_common(a1: str, b1: str, x_s: str, x_t: str) -> str:
    payload = {
        "s0": 3,
        "s1": "",
        "x0": "1",
        "x1": "4.2.2",
        "x2": "Mac OS",
        "x3": "xhs-pc-web",
        "x4": "4.74.0",
        "x5": a1,
        "x6": x_t,
        "x7": x_s,
        "x8": b1,
        "x9": _xhs_mrc(x_t + x_s + b1),
        "x10": 154,
        "x11": "normal",
    }
    return _xhs_b64_encode(_xhs_encode_utf8(_xhs_json_dumps(payload)))


def _xhs_cookie_value(cookies: List[Dict[str, Any]], name: str) -> str:
    for item in cookies:
        if str(item.get("name") or "").strip() == name:
            return str(item.get("value") or "").strip()
    return ""


async def _xhs_sign_headers(
    page: Any,
    *,
    uri: str,
    data: Any,
    method: str,
    cookies: List[Dict[str, Any]],
) -> Tuple[Dict[str, str], str]:
    sign_str = _xhs_build_sign_string(uri, data, method)
    md5_str = hashlib.md5(sign_str.encode("utf-8")).hexdigest()
    try:
        x3_value = await page.evaluate(
            """
            ([signStr, md5Str]) => {
              if (typeof window.mnsv2 !== 'function') return '';
              try {
                return window.mnsv2(signStr, md5Str) || '';
              } catch (_e) {
                return '';
              }
            }
            """,
            [sign_str, md5_str],
        )
    except Exception as exc:
        return {}, f"mnsv2_eval_failed:{str(exc)[:120]}"
    x3 = str(x3_value or "").strip()
    if not x3:
        return {}, "mnsv2_empty_signature"

    try:
        b1 = str(await page.evaluate("() => window.localStorage.getItem('b1') || ''") or "").strip()
    except Exception:
        b1 = ""
    a1 = _xhs_cookie_value(cookies, "a1")
    data_type = "object" if isinstance(data, (dict, list)) else "string"
    x_s = _xhs_build_xs_payload(x3, data_type=data_type)
    x_t = str(int(time.time() * 1000))
    return ({
        "X-S": x_s,
        "X-T": x_t,
        "x-S-Common": _xhs_build_xs_common(a1, b1, x_s, x_t),
        "X-B3-Traceid": _xhs_trace_id(),
    }, "")


def _xhs_payload_view(raw: Dict[str, Any]) -> Dict[str, Any]:
    data = raw.get("data")
    if isinstance(data, dict):
        return data
    return raw


def _xhs_is_hard_fail(error: str) -> bool:
    return (
        "api_error_300011" in error
        or "api_error_300012" in error
        or "api_error_-510001" in error
        or "mnsv2_" in error
    )


def _xhs_normalize_error(errors: List[str]) -> str:
    for item in errors:
        if "api_error_300011" in item:
            return "xhs_account_abnormal_300011"
        if "api_error_300012" in item:
            return "xhs_network_risk_300012"
        if "api_error_-510001" in item:
            return "xhs_note_abnormal_-510001"
        if "mnsv2_" in item:
            return "xhs_sign_unavailable"
    return "session_crawl_empty"


async def _xhs_request_json_signed(
    page: Any,
    *,
    method: str,
    uri: str,
    cookies: List[Dict[str, Any]],
    params: Dict[str, Any] | None = None,
    payload: Dict[str, Any] | None = None,
    timeout_ms: int = 15000,
) -> Tuple[Dict[str, Any] | None, str]:
    method = method.upper()
    data_for_sign: Any = params if method == "GET" else payload
    headers, sign_error = await _xhs_sign_headers(
        page,
        uri=uri,
        data=data_for_sign or {},
        method=method,
        cookies=cookies,
    )
    if sign_error:
        return None, sign_error

    try:
        if method == "GET":
            resp = await page.request.get(
                f"{XHS_EDITH_HOST}{uri}",
                params=params or {},
                headers=headers,
                timeout=timeout_ms,
            )
        else:
            body = _xhs_json_dumps(payload or {})
            req_headers = {**headers, "Content-Type": "application/json;charset=UTF-8"}
            resp = await page.request.post(
                f"{XHS_EDITH_HOST}{uri}",
                data=body,
                headers=req_headers,
                timeout=timeout_ms,
            )
    except Exception as exc:
        return None, f"request_failed:{str(exc)[:120]}"

    status = int(getattr(resp, "status", 0))
    if status != 200:
        try:
            body_text = await resp.text()
        except Exception:
            body_text = ""
        return None, f"http_{status}:{body_text[:120]}"

    try:
        raw = await resp.json()
    except Exception as exc:
        return None, f"invalid_json:{str(exc)[:120]}"
    if not isinstance(raw, dict):
        return None, "invalid_json_payload"

    success = raw.get("success")
    code = raw.get("code")
    if success is False or (isinstance(code, int) and code not in (0,)):
        message = str(raw.get("msg") or raw.get("message") or "")
        return raw, f"api_error_{code}:{message[:120]}"

    return raw, ""


def _xhs_search_sorts(mode: str) -> List[str]:
    if mode == "quick":
        return ["popularity_descending", "time_descending"]
    return ["popularity_descending", "general", "time_descending"]


async def _fetch_xhs_search_notes_signed(
    page: Any,
    *,
    query: str,
    mode: str,
    max_notes: int,
    cookies: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    errors: List[str] = []
    pool_target = _note_candidate_pool_size(max_notes, mode)
    max_pages = 1 if mode == "quick" else 2
    page_size = 20
    search_id = str(int(time.time() * 1000))

    for sort in _xhs_search_sorts(mode):
        for page_no in range(1, max_pages + 1):
            payload = {
                "keyword": query,
                "page": page_no,
                "page_size": page_size,
                "search_id": search_id,
                "sort": sort,
                "note_type": 0,
            }
            raw, err = await _xhs_request_json_signed(
                page,
                method="POST",
                uri="/api/sns/web/v1/search/notes",
                payload=payload,
                cookies=cookies,
                timeout_ms=12000 if mode == "quick" else 16000,
            )
            if err:
                errors.append(f"search:{sort}:{err}")
                if _xhs_is_hard_fail(err):
                    return rows, errors
                continue
            if raw is None:
                continue
            data_view = _xhs_payload_view(raw)
            batch = _extract_note_candidates_from_payload(data_view, "xiaohongshu")
            for item in batch:
                uniq = str(item.get("url") or item.get("id") or "")
                if not uniq or uniq in seen:
                    continue
                seen.add(uniq)
                item["source"] = f"api_signed:{sort}"
                item["search_sort"] = sort
                rows.append(item)
                if len(rows) >= pool_target:
                    return rows, errors
            has_more = data_view.get("has_more") if isinstance(data_view, dict) else None
            if has_more is False:
                break
            await page.wait_for_timeout(380 if mode == "quick" else 520)
    return rows, errors


def _normalize_comment_text(value: Any) -> str:
    return str(value or "").strip()


def _is_valid_comment_text(value: Any) -> bool:
    text = _normalize_comment_text(value)
    if len(text) < COMMENT_MIN_CHARS or len(text) > COMMENT_MAX_CHARS:
        return False
    compact = re.sub(r"\s+", "", text, flags=re.UNICODE).lower()
    if compact in {
        "点击评论",
        "登录后查看更多评论",
        "暂无评论",
    }:
        return False
    if "这是一片荒地点击评论" in compact:
        return False
    # Skip mostly punctuation/noise-only lines.
    stripped = re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)
    return len(stripped) > 0


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


def _extract_xhs_tokens_from_url(url: str) -> Dict[str, str]:
    try:
        parsed = urlparse(url)
        query = parse_qs(parsed.query, keep_blank_values=True)
        token = str((query.get("xsec_token") or [""])[0] or "").strip()
        source = str((query.get("xsec_source") or [""])[0] or "").strip()
        return {"xsec_token": token, "xsec_source": source}
    except Exception:
        return {"xsec_token": "", "xsec_source": ""}


def _with_xhs_tokens(url: str, xsec_token: str, xsec_source: str) -> str:
    if not url or not xsec_token:
        return url
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query["xsec_token"] = [xsec_token]
    query["xsec_source"] = [xsec_source or "pc_search"]
    encoded = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=encoded))


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


async def _goto_with_fallback(page: Any, url: str, timeout_ms: int = 35000) -> str:
    """Navigate with a soft fallback to reduce full-task failure caused by page load waits."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        return ""
    except Exception as first_exc:  # noqa: BLE001
        try:
            await page.goto(url, wait_until="commit", timeout=max(12000, int(timeout_ms * 0.6)))
            return f"goto_fallback:{str(first_exc)[:120]}"
        except Exception as second_exc:  # noqa: BLE001
            raise RuntimeError(f"goto_failed:{str(second_exc)[:220]}") from second_exc


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


def _extract_note_candidates_from_payload(payload: Any, platform: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for obj in _walk_json_nodes(payload):
        note_card = obj.get("note_card") if isinstance(obj.get("note_card"), dict) else {}
        interact_info = note_card.get("interact_info") if isinstance(note_card.get("interact_info"), dict) else {}
        nid = ""
        if platform == "xiaohongshu":
            nid = str(
                obj.get("note_id")
                or obj.get("id")
                or note_card.get("note_id")
                or note_card.get("id")
                or ""
            ).strip()
        else:
            nid = str(obj.get("aweme_id") or obj.get("id") or "").strip()
        title = str(
            obj.get("title")
            or note_card.get("display_title")
            or note_card.get("title")
            or obj.get("name")
            or obj.get("desc")
            or note_card.get("desc")
            or ""
        ).strip()
        desc = str(
            obj.get("desc")
            or note_card.get("desc")
            or note_card.get("description")
            or obj.get("content")
            or ""
        ).strip()
        url = str(obj.get("url") or obj.get("jump_url") or obj.get("share_url") or "").strip()
        if not url and nid:
            url = (
                f"https://www.xiaohongshu.com/explore/{nid}"
                if platform == "xiaohongshu"
                else f"https://www.douyin.com/video/{nid}"
            )
        if not url:
            continue
        xsec_token = ""
        xsec_source = ""
        if platform == "xiaohongshu":
            xsec_info = obj.get("xsec_info") if isinstance(obj.get("xsec_info"), dict) else {}
            xsec_token = str(
                obj.get("xsec_token")
                or obj.get("xsecToken")
                or obj.get("xsec_token_v2")
                or xsec_info.get("xsec_token")
                or xsec_info.get("token")
                or note_card.get("xsec_token")
                or ""
            ).strip()
            xsec_source = str(
                obj.get("xsec_source")
                or obj.get("xsecSource")
                or xsec_info.get("xsec_source")
                or xsec_info.get("source")
                or "pc_search"
            ).strip()
            if not xsec_token:
                url_tokens = _extract_xhs_tokens_from_url(url)
                xsec_token = url_tokens.get("xsec_token", "")
                xsec_source = url_tokens.get("xsec_source", "") or xsec_source or "pc_search"
            if xsec_token:
                url = _with_xhs_tokens(url, xsec_token, xsec_source or "pc_search")

        liked_count = _safe_int(
            obj.get("liked_count")
            or obj.get("like_count")
            or obj.get("digg_count")
            or obj.get("likedCount"),
            _safe_int(interact_info.get("liked_count"), 0),
        )
        comments_count = _safe_int(
            obj.get("comments_count")
            or obj.get("comment_count")
            or obj.get("commentCount"),
            _safe_int(interact_info.get("comment_count"), 0),
        )
        collected_count = _safe_int(
            obj.get("collected_count")
            or obj.get("collect_count")
            or obj.get("favorite_count"),
            _safe_int(interact_info.get("collected_count"), 0),
        )
        if platform == "xiaohongshu":
            # search notes carry counts in note_card.interact_info as string.
            liked_count = max(liked_count, _safe_int(interact_info.get("liked_count"), 0))
            comments_count = max(comments_count, _safe_int(interact_info.get("comment_count"), 0))
            collected_count = max(collected_count, _safe_int(interact_info.get("collected_count"), 0))
        uniq = f"{nid}|{url}"
        if uniq in seen:
            continue
        seen.add(uniq)
        rows.append({
            "id": nid or _extract_id_from_url(url, r"/([^/?]+)$"),
            "url": url,
            "title": title[:80] if title else desc[:80],
            "desc": desc[:1000],
            "liked_count": liked_count,
            "comments_count": comments_count,
            "collected_count": collected_count,
            "source": "api",
            "xsec_token": xsec_token,
            "xsec_source": xsec_source,
        })
        if len(rows) >= 80:
            break
    return rows


def _extract_comment_candidates_from_payload(payload: Any, platform: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for obj in _walk_json_nodes(payload):
        raw_content = obj.get("content")
        if isinstance(raw_content, dict):
            raw_content = (
                raw_content.get("text")
                or raw_content.get("content")
                or raw_content.get("value")
                or ""
            )
        content = _normalize_comment_text(raw_content or obj.get("text") or obj.get("comment_text") or "")
        if not _is_valid_comment_text(content):
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


def _to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("1", "true", "yes", "y"):
            return True
        if v in ("0", "false", "no", "n"):
            return False
    return None


def _extract_comment_pagination_hints(payload: Any) -> List[Dict[str, Any]]:
    hints: List[Dict[str, Any]] = []
    for obj in _walk_json_nodes(payload):
        cursor_values: Dict[str, str] = {}
        for key in ("cursor", "next_cursor", "max_cursor", "offset"):
            value = obj.get(key)
            if value is None or value == "":
                continue
            cursor_values[key] = str(value)

        has_more = _to_bool(obj.get("has_more"))
        if has_more is None:
            has_more = _to_bool(obj.get("hasMore"))
        if has_more is None:
            has_more = _to_bool(obj.get("more"))

        if not cursor_values and has_more is None:
            continue
        hints.append({
            "cursor_values": cursor_values,
            "has_more": has_more,
        })
        if len(hints) >= 24:
            break
    return hints


def _build_cursor_url(base_url: str, cursor_values: Dict[str, str]) -> str:
    if not base_url or not cursor_values:
        return ""
    parsed = urlparse(base_url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in cursor_values.items():
        query[key] = [value]
    encoded = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=encoded))


async def _collect_paginated_comments(
    page: Any,
    platform: str,
    page_hints: List[Dict[str, Any]],
    max_comments: int,
    max_pages: int,
    seen_keys: set[str],
) -> List[Dict[str, Any]]:
    if max_comments <= 0 or max_pages <= 0:
        return []
    queue: List[Dict[str, Any]] = []
    for hint in page_hints:
        cursor_values = hint.get("cursor_values") if isinstance(hint, dict) else {}
        has_more = hint.get("has_more") if isinstance(hint, dict) else None
        if has_more is False:
            continue
        if not isinstance(cursor_values, dict) or not cursor_values:
            continue
        url = str(hint.get("url") or "")
        if not url:
            continue
        queue.append({
            "url": url,
            "cursor_values": {str(k): str(v) for k, v in cursor_values.items() if v is not None and v != ""},
        })
        if len(queue) >= 16:
            break

    collected: List[Dict[str, Any]] = []
    visited: set[str] = set()
    pages = 0

    while queue and pages < max_pages and len(collected) < max_comments:
        current = queue.pop(0)
        next_url = _build_cursor_url(str(current.get("url") or ""), dict(current.get("cursor_values") or {}))
        if not next_url or next_url in visited:
            continue
        visited.add(next_url)

        try:
            resp = await page.request.get(next_url, timeout=15000)
            if int(getattr(resp, "status", 0)) != 200:
                continue
            raw = await resp.json()
        except Exception:
            continue

        pages += 1
        for item in _extract_comment_candidates_from_payload(raw, platform):
            text = _normalize_comment_text(item.get("content"))
            if not _is_valid_comment_text(text):
                continue
            key = text[:180]
            if key in seen_keys:
                continue
            seen_keys.add(key)
            collected.append(item)
            if len(collected) >= max_comments:
                break

        if len(collected) >= max_comments:
            break

        raw_url = str(getattr(resp, "url", next_url) or next_url)
        for next_hint in _extract_comment_pagination_hints(raw):
            cursor_values = next_hint.get("cursor_values") if isinstance(next_hint, dict) else {}
            has_more = next_hint.get("has_more") if isinstance(next_hint, dict) else None
            if has_more is False:
                continue
            if not isinstance(cursor_values, dict) or not cursor_values:
                continue
            queue.append({
                "url": raw_url,
                "cursor_values": {str(k): str(v) for k, v in cursor_values.items() if v is not None and v != ""},
            })
            if len(queue) >= 24:
                break

    return collected


async def _fetch_xhs_comments_direct(
    page: Any,
    note_id: str,
    xsec_token: str,
    xsec_source: str,
    max_comments: int,
    max_pages: int,
    seen_keys: set[str],
    cookies: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], str]:
    if not note_id or not xsec_token or max_comments <= 0:
        return [], ""

    collected: List[Dict[str, Any]] = []
    last_error = ""
    for uri in XHS_COMMENT_PAGE_URIS:
        cursor = ""
        page_count = 0
        while len(collected) < max_comments and page_count < max(1, int(max_pages)):
            params = {
                "note_id": note_id,
                "cursor": cursor,
                "top_comment_id": "",
                "image_formats": "jpg,webp,avif",
                "xsec_token": xsec_token,
                "xsec_source": xsec_source or "pc_search",
            }
            raw, err = await _xhs_request_json_signed(
                page,
                method="GET",
                uri=uri,
                params=params,
                cookies=cookies,
                timeout_ms=13000,
            )
            if err:
                last_error = err
                if _xhs_is_hard_fail(err):
                    return collected, err
                break
            if raw is None:
                break
            data_view = _xhs_payload_view(raw)
            for item in _extract_comment_candidates_from_payload(data_view, "xiaohongshu"):
                text = _normalize_comment_text(item.get("content"))
                if not _is_valid_comment_text(text):
                    continue
                key = text[:180]
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                collected.append(item)
                if len(collected) >= max_comments:
                    return collected, ""

            hints = _extract_comment_pagination_hints(data_view)
            next_cursor = ""
            has_more = False
            if isinstance(data_view, dict):
                has_more = bool(data_view.get("has_more") or data_view.get("hasMore"))
                next_cursor = str(
                    data_view.get("cursor")
                    or data_view.get("next_cursor")
                    or data_view.get("max_cursor")
                    or ""
                ).strip()
            if not next_cursor:
                for hint in hints:
                    cursor_values = hint.get("cursor_values") if isinstance(hint, dict) else {}
                    if not isinstance(cursor_values, dict):
                        continue
                    next_cursor = str(
                        cursor_values.get("cursor")
                        or cursor_values.get("next_cursor")
                        or cursor_values.get("max_cursor")
                        or cursor_values.get("offset")
                        or ""
                    ).strip()
                    if next_cursor:
                        break
            if not next_cursor:
                break
            if not has_more and page_count > 0:
                break
            cursor = next_cursor
            page_count += 1
            await page.wait_for_timeout(260)

    return collected, last_error


def _note_candidate_pool_size(max_notes: int, mode: str) -> int:
    base = max(1, int(max_notes))
    floor = 8 if mode == "quick" else 12
    multiplier = 2 if mode == "quick" else 3
    return min(48, max(base, floor, base * multiplier))


def _note_engagement_score(row: Dict[str, Any]) -> float:
    liked = _safe_int(row.get("liked_count"), 0)
    comments = _safe_int(row.get("comments_count"), 0)
    collected = _safe_int(row.get("collected_count"), 0)
    source = str(row.get("source") or "")
    source_bonus = 12 if source.startswith("api_signed:") else (6 if source == "api" else 0)
    sort = str(row.get("search_sort") or "")
    sort_bonus = 20 if sort == "popularity_descending" else (8 if sort == "general" else (4 if sort == "time_descending" else 0))
    return float(liked) + float(comments) * 2.2 + float(collected) * 1.3 + source_bonus + sort_bonus


def _merge_note_sources(
    dom_rows: List[Dict[str, Any]],
    api_rows: List[Dict[str, Any]],
    max_notes: int,
    mode: str,
) -> List[Dict[str, Any]]:
    by_url: Dict[str, Dict[str, Any]] = {}
    for raw in dom_rows + api_rows:
        url = str(raw.get("url") or "").strip()
        if not url:
            continue
        candidate: Dict[str, Any] = {
            "id": str(raw.get("id") or ""),
            "url": url,
            "title": str(raw.get("title") or "")[:80],
            "desc": str(raw.get("desc") or "")[:1000],
            "liked_count": _safe_int(raw.get("liked_count"), 0),
            "comments_count": _safe_int(raw.get("comments_count"), 0),
            "collected_count": _safe_int(raw.get("collected_count"), 0),
            "source": str(raw.get("source") or "dom"),
            "xsec_token": str(raw.get("xsec_token") or "").strip(),
            "xsec_source": str(raw.get("xsec_source") or "").strip(),
            "search_sort": str(raw.get("search_sort") or "").strip(),
        }
        candidate["score"] = _note_engagement_score(candidate)
        existing = by_url.get(url)
        if existing is None:
            by_url[url] = candidate
            continue
        if not str(existing.get("xsec_token") or "").strip() and str(candidate.get("xsec_token") or "").strip():
            existing["xsec_token"] = candidate.get("xsec_token")
            existing["xsec_source"] = candidate.get("xsec_source")
            existing["search_sort"] = candidate.get("search_sort")
        existing["liked_count"] = max(_safe_int(existing.get("liked_count"), 0), _safe_int(candidate.get("liked_count"), 0))
        existing["comments_count"] = max(_safe_int(existing.get("comments_count"), 0), _safe_int(candidate.get("comments_count"), 0))
        existing["collected_count"] = max(_safe_int(existing.get("collected_count"), 0), _safe_int(candidate.get("collected_count"), 0))
        existing["score"] = _note_engagement_score(existing)
        replace = False
        if float(candidate.get("score", 0)) > float(existing.get("score", 0)):
            replace = True
        elif len(str(candidate.get("desc") or "")) > len(str(existing.get("desc") or "")):
            replace = True
        elif len(str(candidate.get("title") or "")) > len(str(existing.get("title") or "")):
            replace = True
        if replace:
            by_url[url] = candidate

    pool_size = _note_candidate_pool_size(max_notes, mode)
    ranked = sorted(
        by_url.values(),
        key=lambda x: (
            float(x.get("score", 0)),
            _safe_int(x.get("comments_count"), 0),
            _safe_int(x.get("liked_count"), 0),
            len(str(x.get("desc") or "")),
        ),
        reverse=True,
    )
    return ranked[:pool_size]


async def _crawl_xiaohongshu(
    payload: CrawlerJobPayload,
    session: Dict[str, Any],
) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
    started = time.time()
    notes: List[CrawlerNormalizedNote] = []
    comments: List[CrawlerNormalizedComment] = []
    proxy_calls = 0
    xhs_errors: List[str] = []

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
                search_api_notes: List[Dict[str, Any]] = []
                signed_search_notes: List[Dict[str, Any]] = []
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
                nav_warning = await _goto_with_fallback(page, search_url, timeout_ms=35000)
                await page.wait_for_timeout(2000)
                signed_search_notes, signed_search_errors = await _fetch_xhs_search_notes_signed(
                    page,
                    query=payload.query,
                    mode=payload.mode,
                    max_notes=payload.limits.notes,
                    cookies=cookies,
                )
                if signed_search_errors:
                    xhs_errors.extend(signed_search_errors)
                for _ in range(2 if payload.mode == "quick" else 3):
                    await page.mouse.wheel(0, 1800)
                    await page.wait_for_timeout(700)
                if search_capture_tasks:
                    await asyncio.gather(*search_capture_tasks, return_exceptions=True)
                search_api_notes.extend(signed_search_notes)

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
                        rows.push({
                          url,
                          title: title.slice(0, 80),
                          desc: '',
                          liked_count: 0,
                          comments_count: 0,
                          collected_count: 0,
                          source: 'dom',
                          xsec_token: '',
                          xsec_source: '',
                        });
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
                    payload.mode,
                )
                note_timeout_ms = 12000 if payload.mode == "quick" else 32000
                nav_retry_limit = 1 if payload.mode == "quick" else 2
                max_empty_comment_notes = 4 if payload.mode == "quick" else 12
                empty_comment_notes = 0

                for idx, item in enumerate(note_candidates):
                    if len(notes) >= max(1, int(payload.limits.notes)):
                        break
                    if len(notes) <= 0 and empty_comment_notes >= max_empty_comment_notes:
                        break
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    note_xsec_token = str((item or {}).get("xsec_token") or "").strip()
                    note_xsec_source = str((item or {}).get("xsec_source") or "pc_search").strip()
                    if note_xsec_token:
                        url = _with_xhs_tokens(url, note_xsec_token, note_xsec_source)
                    note_id = str((item or {}).get("id") or "") or _extract_id_from_url(url, r"/explore/([^/?]+)")

                    # API-first for reliability: fetch comments directly via signed endpoints.
                    preflight_comment_keys: set[str] = set()
                    preflight_comments: List[Dict[str, Any]] = []
                    if note_xsec_token:
                        preflight_comments, preflight_error = await _fetch_xhs_comments_direct(
                            page,
                            note_id=note_id,
                            xsec_token=note_xsec_token,
                            xsec_source=note_xsec_source,
                            max_comments=payload.limits.comments_per_note,
                            max_pages=(
                                settings.crawler_xhs_quick_comment_pages
                                if payload.mode == "quick"
                                else settings.crawler_xhs_deep_comment_pages
                            ),
                            seen_keys=preflight_comment_keys,
                            cookies=cookies,
                        )
                        if preflight_error:
                            xhs_errors.append(f"comment_preflight:{preflight_error}")

                    if preflight_comments:
                        preflight_comments.sort(key=lambda row: _safe_int(row.get("like_count"), 0), reverse=True)
                        note = CrawlerNormalizedNote(
                            id=note_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((item or {}).get("desc") or ""),
                            liked_count=_safe_int((item or {}).get("liked_count"), 0),
                            comments_count=max(len(preflight_comments), _safe_int((item or {}).get("comments_count"), 0)),
                            collected_count=_safe_int((item or {}).get("collected_count"), 0),
                            published_at=None,
                            platform="xiaohongshu",
                            url=url,
                        )
                        notes.append(note)
                        empty_comment_notes = 0
                        for comment_idx, comment_item in enumerate(preflight_comments):
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
                        continue

                    note_page = await context.new_page()
                    try:
                        note_api_comments: List[Dict[str, Any]] = []
                        note_comment_hints: List[Dict[str, Any]] = []
                        note_capture_tasks: List[asyncio.Task[Any]] = []

                        async def capture_note_response(response: Any) -> None:
                            raw_resp_url = str(getattr(response, "url", "")).strip()
                            resp_url = raw_resp_url.lower()
                            if "xiaohongshu.com" not in resp_url and "xhscdn.com" not in resp_url:
                                return
                            content_type = str(getattr(response, "headers", {}).get("content-type", "")).lower()
                            if (
                                "json" not in content_type
                                and "comment" not in resp_url
                                and "note" not in resp_url
                                and "feed" not in resp_url
                            ):
                                return
                            try:
                                raw = await response.json()
                            except Exception:
                                return
                            note_api_comments.extend(_extract_comment_candidates_from_payload(raw, "xiaohongshu"))
                            for hint in _extract_comment_pagination_hints(raw):
                                cursor_values = hint.get("cursor_values") if isinstance(hint, dict) else {}
                                if not isinstance(cursor_values, dict) or not cursor_values:
                                    continue
                                note_comment_hints.append({
                                    "url": raw_resp_url,
                                    "cursor_values": cursor_values,
                                    "has_more": hint.get("has_more") if isinstance(hint, dict) else None,
                                })

                        def on_note_response(response: Any) -> None:
                            note_capture_tasks.append(asyncio.create_task(capture_note_response(response)))

                        note_page.on("response", on_note_response)
                        opened = False
                        for nav_attempt in range(nav_retry_limit):
                            try:
                                await _goto_with_fallback(note_page, url, timeout_ms=note_timeout_ms)
                                opened = True
                                break
                            except Exception:
                                if nav_attempt >= (nav_retry_limit - 1):
                                    raise
                                await note_page.wait_for_timeout(1200)
                        if not opened:
                            continue
                        await note_page.wait_for_timeout(1200)
                        await note_page.evaluate(
                            """
                            () => {
                              const targets = Array.from(document.querySelectorAll('button, a, span, div'));
                              const found = targets.find((el) => {
                                const text = (el.textContent || '').trim();
                                return /全部评论|查看全部|展开评论|评论/.test(text);
                              });
                              if (found && typeof found.click === 'function') found.click();
                            }
                            """
                        )
                        await note_page.wait_for_timeout(700)
                        for _ in range(4 if payload.mode == "quick" else 7):
                            await note_page.mouse.wheel(0, 1600)
                            await note_page.wait_for_timeout(750 if payload.mode == "quick" else 900)
                        if note_capture_tasks:
                            await asyncio.gather(*note_capture_tasks, return_exceptions=True)
                        seen_comment_keys = {
                            str(item.get("content") or "").strip()[:180]
                            for item in note_api_comments
                            if str(item.get("content") or "").strip()
                        }
                        extra_api_comments = await _collect_paginated_comments(
                            note_page,
                            "xiaohongshu",
                            note_comment_hints,
                            max_comments=max(0, payload.limits.comments_per_note - len(note_api_comments)),
                            max_pages=1 if payload.mode == "quick" else 3,
                            seen_keys=seen_comment_keys,
                        )
                        if extra_api_comments:
                            note_api_comments.extend(extra_api_comments)
                        if len(note_api_comments) < payload.limits.comments_per_note:
                            direct_comments, direct_error = await _fetch_xhs_comments_direct(
                                note_page,
                                note_id=note_id,
                                xsec_token=note_xsec_token,
                                xsec_source=note_xsec_source,
                                max_comments=max(0, payload.limits.comments_per_note - len(note_api_comments)),
                                max_pages=(
                                    settings.crawler_xhs_quick_comment_pages
                                    if payload.mode == "quick"
                                    else settings.crawler_xhs_deep_comment_pages
                                ),
                                seen_keys=seen_comment_keys,
                                cookies=cookies,
                            )
                            if direct_error:
                                xhs_errors.append(f"comment:{direct_error}")
                            if direct_comments:
                                note_api_comments.extend(direct_comments)
                        note_api_comments.sort(key=lambda row: _safe_int(row.get("like_count"), 0), reverse=True)
                        detail = await note_page.evaluate(
                            f"""
                            (maxComments) => {{
                              const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
                              const articleText = (document.querySelector('article')?.innerText || '').trim();
                              const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
                              const desc = (metaDesc || ogDesc || articleText || '').slice(0, 1000);
                              const candidates = Array.from(document.querySelectorAll('[class*="comment"] [class*="content"], [class*="comment"] p, [class*="comment"] span, [id*="comment"] p, [id*="comment"] span, [data-testid*="comment"]'))
                                .map(el => (el.textContent || '').trim())
                                .filter(t => t.length >= 2 && t.length <= 120);
                              const stateCandidates = [];
                              try {{
                                const root = (window.__INITIAL_STATE__ || window.__PRELOADED_STATE__ || window.__state__ || null);
                                const stack = [root];
                                const seenObj = new Set();
                                let guard = 0;
                                while (stack.length && guard < 2500) {{
                                  guard += 1;
                                  const cur = stack.pop();
                                  if (!cur || typeof cur !== 'object') continue;
                                  if (seenObj.has(cur)) continue;
                                  seenObj.add(cur);
                                  if (Array.isArray(cur)) {{
                                    for (const it of cur) {{
                                      if (it && typeof it === 'object') stack.push(it);
                                    }}
                                    continue;
                                  }}
                                  const content = (cur.content || cur.text || cur.comment_text || '').toString().trim();
                                  if (content.length >= 2 && content.length <= 160) {{
                                    stateCandidates.push(content);
                                  }}
                                  for (const v of Object.values(cur)) {{
                                    if (v && typeof v === 'object') stack.push(v);
                                  }}
                                }}
                              }} catch (_e) {{}}
                              const allCandidates = [...candidates, ...stateCandidates];
                              const uniq = [];
                              const seen = new Set();
                              for (const c of allCandidates) {{
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
                            text = _normalize_comment_text(c.get("content"))
                            if not _is_valid_comment_text(text):
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
                                text = _normalize_comment_text(raw_content)
                                if not _is_valid_comment_text(text):
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
                        # Keep evidence reliable: skip note pages without any usable comments.
                        if len(merged_comments) <= 0:
                            empty_comment_notes += 1
                            continue

                        note = CrawlerNormalizedNote(
                            id=note_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or (item or {}).get("desc") or ""),
                            liked_count=_safe_int((item or {}).get("liked_count"), 0),
                            comments_count=max(len(merged_comments), _safe_int((item or {}).get("comments_count"), 0)),
                            collected_count=_safe_int((item or {}).get("collected_count"), 0),
                            published_at=None,
                            platform="xiaohongshu",
                            url=url,
                        )
                        notes.append(note)
                        empty_comment_notes = 0

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
                    except Exception:
                        # Skip noisy/blocked note pages instead of failing the whole crawl.
                        continue
                    finally:
                        await note_page.close()

                if nav_warning and not notes:
                    raise RuntimeError(nav_warning)
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
            error=None if success else _xhs_normalize_error(xhs_errors),
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
                search_api_notes: List[Dict[str, Any]] = []
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
                await _goto_with_fallback(page, search_url, timeout_ms=35000)
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
                        rows.push({
                          url,
                          title,
                          desc: '',
                          liked_count: 0,
                          comments_count: 0,
                          collected_count: 0,
                          source: 'dom',
                        });
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
                    payload.mode,
                )
                note_timeout_ms = 12000 if payload.mode == "quick" else 32000
                nav_retry_limit = 1 if payload.mode == "quick" else 2
                max_empty_comment_notes = 4 if payload.mode == "quick" else 12
                empty_comment_notes = 0

                for idx, item in enumerate(note_candidates):
                    if len(notes) >= max(1, int(payload.limits.notes)):
                        break
                    if len(notes) <= 0 and empty_comment_notes >= max_empty_comment_notes:
                        break
                    if idx > 0:
                        await _human_delay(payload.mode)
                    url = str((item or {}).get("url") or "")
                    if not url:
                        continue
                    video_id = str((item or {}).get("id") or "") or _extract_id_from_url(url, r"/video/([^/?]+)")
                    note_page = await context.new_page()
                    try:
                        note_api_comments: List[Dict[str, Any]] = []
                        note_comment_hints: List[Dict[str, Any]] = []
                        note_capture_tasks: List[asyncio.Task[Any]] = []

                        async def capture_note_response(response: Any) -> None:
                            raw_resp_url = str(getattr(response, "url", "")).strip()
                            resp_url = raw_resp_url.lower()
                            if "comment" not in resp_url:
                                return
                            try:
                                raw = await response.json()
                            except Exception:
                                return
                            note_api_comments.extend(_extract_comment_candidates_from_payload(raw, "douyin"))
                            for hint in _extract_comment_pagination_hints(raw):
                                cursor_values = hint.get("cursor_values") if isinstance(hint, dict) else {}
                                if not isinstance(cursor_values, dict) or not cursor_values:
                                    continue
                                note_comment_hints.append({
                                    "url": raw_resp_url,
                                    "cursor_values": cursor_values,
                                    "has_more": hint.get("has_more") if isinstance(hint, dict) else None,
                                })

                        def on_note_response(response: Any) -> None:
                            note_capture_tasks.append(asyncio.create_task(capture_note_response(response)))

                        note_page.on("response", on_note_response)
                        opened = False
                        for nav_attempt in range(nav_retry_limit):
                            try:
                                await _goto_with_fallback(note_page, url, timeout_ms=note_timeout_ms)
                                opened = True
                                break
                            except Exception:
                                if nav_attempt >= (nav_retry_limit - 1):
                                    raise
                                await note_page.wait_for_timeout(1200)
                        if not opened:
                            continue
                        await note_page.wait_for_timeout(1200)
                        await note_page.evaluate(
                            """
                            () => {
                              const targets = Array.from(document.querySelectorAll('button, a, span, div'));
                              const found = targets.find((el) => {
                                const text = (el.textContent || '').trim();
                                return /全部评论|查看全部|展开评论|评论/.test(text);
                              });
                              if (found && typeof found.click === 'function') found.click();
                            }
                            """
                        )
                        await note_page.wait_for_timeout(700)
                        for _ in range(4 if payload.mode == "quick" else 7):
                            await note_page.mouse.wheel(0, 1600)
                            await note_page.wait_for_timeout(750 if payload.mode == "quick" else 900)
                        if note_capture_tasks:
                            await asyncio.gather(*note_capture_tasks, return_exceptions=True)
                        seen_comment_keys = {
                            str(item.get("content") or "").strip()[:180]
                            for item in note_api_comments
                            if str(item.get("content") or "").strip()
                        }
                        extra_api_comments = await _collect_paginated_comments(
                            note_page,
                            "douyin",
                            note_comment_hints,
                            max_comments=max(0, payload.limits.comments_per_note - len(note_api_comments)),
                            max_pages=1 if payload.mode == "quick" else 3,
                            seen_keys=seen_comment_keys,
                        )
                        if extra_api_comments:
                            note_api_comments.extend(extra_api_comments)
                        detail = await note_page.evaluate(
                            """
                            (maxComments) => {
                              const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
                              const pageText = (document.body?.innerText || '').trim();
                              const desc = (metaDesc || pageText || '').slice(0, 1000);
                              const commentNodes = Array.from(document.querySelectorAll('[data-e2e*="comment"] [data-e2e*="content"], [class*="comment"] [class*="content"], [class*="comment"] p, [class*="comment"] span'))
                                .map(el => (el.textContent || '').trim())
                                .filter(t => t.length >= 2 && t.length <= 120);
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
                            text = _normalize_comment_text(c.get("content"))
                            if not _is_valid_comment_text(text):
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
                                text = _normalize_comment_text(raw_content)
                                if not _is_valid_comment_text(text):
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
                        # Keep evidence reliable: skip note pages without any usable comments.
                        if len(merged_comments) <= 0:
                            empty_comment_notes += 1
                            continue

                        note = CrawlerNormalizedNote(
                            id=video_id,
                            title=str((item or {}).get("title") or payload.query)[:80],
                            desc=str((detail or {}).get("desc") or (item or {}).get("desc") or ""),
                            liked_count=_safe_int((item or {}).get("liked_count"), 0),
                            comments_count=len(merged_comments),
                            collected_count=_safe_int((item or {}).get("collected_count"), 0),
                            published_at=None,
                            platform="douyin",
                            url=url,
                        )
                        notes.append(note)
                        empty_comment_notes = 0

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
                    except Exception:
                        continue
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
