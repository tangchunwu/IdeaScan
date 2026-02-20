from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.config import settings
from app.session_store import (
    SESSION_REQUIRED_ALL_COOKIES,
    SESSION_REQUIRED_ANY_COOKIES,
    session_store,
)

try:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    Browser = Any  # type: ignore[assignment]
    BrowserContext = Any  # type: ignore[assignment]
    Page = Any  # type: ignore[assignment]
    Playwright = Any  # type: ignore[assignment]
    async_playwright = None
    PLAYWRIGHT_AVAILABLE = False


LOGIN_URLS = {
    "xiaohongshu": "https://www.xiaohongshu.com",
    "douyin": "https://www.douyin.com",
}

QR_SELECTORS = {
    "xiaohongshu": [
        "[class*='login'] img[src*='qrcode']",
        "[class*='qrcode'] img[src*='qrcode']",
        "[class*='qrcode'] canvas",
        "[role='dialog'] img[src*='qrcode']",
        "[role='dialog'] [class*='qrcode'] img",
        "[role='dialog'] [class*='qrcode'] canvas",
    ],
    "douyin": [
        "[class*='login'] img[src*='qrcode']",
        "[class*='login'] img[src*='qr']",
        "[class*='qrcode'] img",
        "[class*='qrcode'] canvas",
    ],
}

QR_SELECTORS_RELAXED = {
    "xiaohongshu": [
        "img[src*='qrcode']",
        "img[class*='qrcode']",
        "[class*='qrcode'] img",
    ],
    "douyin": [
        "img[src*='qrcode']",
        "img[src*='qr']",
        "img[class*='qrcode']",
        "[class*='qrcode'] img",
        "canvas",
    ],
}

LOGIN_PROMPT_SELECTORS = {
    "xiaohongshu": [
        "text=扫码登录",
        "text=请扫码登录",
        "text=手机扫码登录",
        "text=打开小红书扫码登录",
        "text=在手机端确认登录",
    ],
    "douyin": [
        "text=扫码登录",
        "text=请使用抖音扫码登录",
        "text=打开抖音扫码登录",
    ],
}


@dataclass
class AuthFlow:
    flow_id: str
    platform: str
    user_id: str
    created_at: float
    expires_at: float
    region: str
    playwright: Playwright
    browser: Browser
    context: BrowserContext
    page: Page
    initial_auth_cookie_values: Dict[str, str]
    login_prompt_seen: bool
    login_prompt_visible_once: bool
    login_prompt_closed: bool


class AuthManager:
    def __init__(self) -> None:
        self._flows: dict[str, AuthFlow] = {}

    async def _capture_qr_image(self, page: Page, platform: str) -> str:
        selectors = QR_SELECTORS.get(platform, []) + QR_SELECTORS_RELAXED.get(platform, [])
        min_size = 90
        max_size = 640
        for selector in selectors:
            try:
                nodes = await page.query_selector_all(selector)
            except Exception:
                continue
            for el in nodes:
                try:
                    if not await el.is_visible():
                        continue
                    # Avoid capturing unrelated feed images: QR must appear in a login/dialog context.
                    if platform == "xiaohongshu":
                        in_login_context = await el.evaluate(
                            """(node) => {
                                if (!node) return false;
                                return Boolean(
                                    node.closest("[role='dialog'], [class*='login'], [class*='Login'], [class*='modal'], [class*='dialog'], [class*='qrcode']")
                                );
                            }"""
                        )
                        if not in_login_context:
                            continue
                    box = await el.bounding_box()
                    if not box:
                        continue
                    width = float(box.get("width") or 0)
                    height = float(box.get("height") or 0)
                    if width < min_size or height < min_size:
                        continue
                    if width > max_size or height > max_size:
                        continue
                    ratio = width / height if height > 0 else 0
                    if ratio < 0.75 or ratio > 1.35:
                        continue
                    png = await el.screenshot(type="png")
                    return base64.b64encode(png).decode("utf-8")
                except Exception:
                    continue
        return ""

    async def _is_qr_visible(self, page: Page, platform: str) -> bool:
        selectors = QR_SELECTORS.get(platform, []) + QR_SELECTORS_RELAXED.get(platform, [])
        min_size = 90
        max_size = 640
        for selector in selectors:
            try:
                nodes = await page.query_selector_all(selector)
            except Exception:
                continue
            for el in nodes:
                try:
                    if not await el.is_visible():
                        continue
                    box = await el.bounding_box()
                    if not box:
                        continue
                    width = float(box.get("width") or 0)
                    height = float(box.get("height") or 0)
                    if width < min_size or height < min_size:
                        continue
                    if width > max_size or height > max_size:
                        continue
                    ratio = width / height if height > 0 else 0
                    if ratio < 0.75 or ratio > 1.35:
                        continue
                    if platform == "xiaohongshu":
                        in_login_context = await el.evaluate(
                            """(node) => {
                                if (!node) return false;
                                return Boolean(
                                    node.closest("[role='dialog'], [class*='login'], [class*='Login'], [class*='modal'], [class*='dialog'], [class*='qrcode']")
                                );
                            }"""
                        )
                        if not in_login_context:
                            continue
                    return True
                except Exception:
                    continue
        return False

    async def _is_login_prompt_visible(self, page: Page, platform: str) -> bool:
        selectors = LOGIN_PROMPT_SELECTORS.get(platform, [])
        for selector in selectors:
            try:
                el = await page.query_selector(selector)
                if el and await el.is_visible():
                    return True
            except Exception:
                continue
        return False

    async def _probe_xhs_session_ready(self, page: Page, cookies: list[dict[str, Any]]) -> tuple[bool, str]:
        # Real capability probe: signed search + one comment fetch.
        # This avoids saving "cookie-present but not truly logged-in" sessions.
        try:
            from app.browser_scraper import _fetch_xhs_comments_direct, _fetch_xhs_search_notes_signed  # noqa: PLC0415
        except Exception as exc:
            return False, f"probe_import_failed:{str(exc)[:120]}"

        try:
            notes, search_errors = await _fetch_xhs_search_notes_signed(
                page,
                query="健身",
                mode="quick",
                max_notes=2,
                cookies=cookies,
            )
            if not notes:
                if search_errors:
                    return False, f"probe_search_empty:{'|'.join(search_errors[:2])[:180]}"
                return False, "probe_search_empty"
            for item in notes:
                note_id = str((item or {}).get("id") or "").strip()
                xsec_token = str((item or {}).get("xsec_token") or "").strip()
                xsec_source = str((item or {}).get("xsec_source") or "pc_search").strip()
                if not note_id or not xsec_token:
                    continue
                rows, err = await _fetch_xhs_comments_direct(
                    page,
                    note_id=note_id,
                    xsec_token=xsec_token,
                    xsec_source=xsec_source,
                    max_comments=1,
                    max_pages=1,
                    seen_keys=set(),
                    cookies=cookies,
                )
                if rows:
                    return True, "probe_ok"
                if err:
                    return False, f"probe_comment_failed:{err[:140]}"
            return False, "probe_no_comment_access"
        except Exception as exc:
            return False, f"probe_exception:{str(exc)[:160]}"

    @staticmethod
    def _auth_cookie_names(platform: str) -> set[str]:
        names = set(SESSION_REQUIRED_ALL_COOKIES.get(platform, set()))
        names.update(SESSION_REQUIRED_ANY_COOKIES.get(platform, set()))
        return names

    @staticmethod
    def _cookie_map(cookies: list[dict[str, Any]]) -> dict[str, str]:
        return {
            str(item.get("name", "")).strip(): str(item.get("value", "")).strip()
            for item in cookies
            if str(item.get("name", "")).strip()
        }

    def _capture_auth_cookie_baseline(self, platform: str, cookies: list[dict[str, Any]]) -> dict[str, str]:
        names = self._auth_cookie_names(platform)
        source = self._cookie_map(cookies)
        return {name: source.get(name, "") for name in names}

    def _build_auth_metrics(self, platform: str, cookies: list[dict[str, Any]]) -> dict[str, Any]:
        cookie_map = self._cookie_map(cookies)
        required_all = sorted(SESSION_REQUIRED_ALL_COOKIES.get(platform, set()))
        required_any = sorted(SESSION_REQUIRED_ANY_COOKIES.get(platform, set()))
        required_all_present_names = [name for name in required_all if cookie_map.get(name)]
        required_any_present_names = [name for name in required_any if cookie_map.get(name)]
        required_all_present = sum(1 for name in required_all if cookie_map.get(name))
        required_any_present = sum(1 for name in required_any if cookie_map.get(name))
        required_all_ok = required_all_present == len(required_all) if required_all else True
        required_any_ok = required_any_present > 0 if required_any else True
        return {
            "cookie_count_total": len(cookie_map),
            "required_all": required_all,
            "required_any": required_any,
            "required_all_present_names": required_all_present_names,
            "required_any_present_names": required_any_present_names,
            "required_all_present": required_all_present,
            "required_any_present": required_any_present,
            "required_all_ok": required_all_ok,
            "required_any_ok": required_any_ok,
        }

    def _changed_auth_cookie_names(self, flow: AuthFlow, cookies: list[dict[str, Any]]) -> set[str]:
        names = self._auth_cookie_names(flow.platform)
        if not names:
            return set()
        current = self._cookie_map(cookies)
        return {
            name
            for name in names
            if current.get(name, "") and current.get(name, "") != flow.initial_auth_cookie_values.get(name, "")
        }

    def _has_auth_cookie_transition(self, flow: AuthFlow, changed: set[str]) -> bool:
        if not changed:
            return False

        # xiaohongshu visitor cookies (e.g. gid/webid) can change without login.
        # Only treat id_token/web_session rotation as strong auto-confirm signal.
        if flow.platform == "xiaohongshu":
            if "id_token" in changed:
                return True
            return "web_session" in changed

        return True

    async def _close_flow(self, flow: AuthFlow) -> None:
        try:
            await flow.context.close()
        except Exception:
            pass
        try:
            await flow.browser.close()
        except Exception:
            pass
        try:
            await flow.playwright.stop()
        except Exception:
            pass

    async def _prune_expired(self) -> None:
        now = time.time()
        to_remove = [flow_id for flow_id, flow in self._flows.items() if now >= flow.expires_at]
        for flow_id in to_remove:
            flow = self._flows.pop(flow_id, None)
            if flow:
                await self._close_flow(flow)

    async def start_flow(self, *, platform: str, user_id: str, region: str = "") -> Dict[str, Any]:
        await self._prune_expired()

        if not PLAYWRIGHT_AVAILABLE or async_playwright is None:
            return {
                "flow_id": "",
                "platform": platform,
                "status": "failed",
                "qr_image_base64": "",
                "expires_in": 0,
                "error": "playwright_not_installed",
            }

        login_url = LOGIN_URLS.get(platform)
        if not login_url:
            return {
                "flow_id": "",
                "platform": platform,
                "status": "failed",
                "qr_image_base64": "",
                "expires_in": 0,
                "error": "unsupported_platform",
            }

        try:
            playwright = await async_playwright().start()
            proxy_binding = await session_store.acquire_proxy_binding(platform=platform, user_id=user_id)
            proxy = proxy_binding.get("proxy") if isinstance(proxy_binding, dict) else None

            browser = await playwright.chromium.launch(
                headless=settings.crawler_playwright_headless,
                proxy=proxy,
                args=["--disable-blink-features=AutomationControlled"],
            )
            ua = settings.crawler_user_agent_pool.split(",")[0].strip() or "Mozilla/5.0"
            context = await browser.new_context(user_agent=ua)
            page = await context.new_page()
            await page.goto(login_url, wait_until="domcontentloaded", timeout=35000)

            # Try opening login modal if page does not show QR by default.
            if platform == "xiaohongshu":
                for sel in ["text=登录", "button:has-text('登录')", "a:has-text('登录')"]:
                    try:
                        btn = await page.query_selector(sel)
                        if btn:
                            await btn.click(timeout=1200)
                            break
                    except Exception:
                        continue
            elif platform == "douyin":
                for sel in ["text=登录", "button:has-text('登录')", "div:has-text('登录')"]:
                    try:
                        btn = await page.query_selector(sel)
                        if btn:
                            await btn.click(timeout=1200)
                            break
                    except Exception:
                        continue

            await page.wait_for_timeout(1200)
            qr_image_base64 = ""
            for _ in range(4):
                login_prompt_seen = await self._is_login_prompt_visible(page, platform)
                if not login_prompt_seen:
                    login_prompt_seen = await self._is_qr_visible(page, platform)
                if not login_prompt_seen:
                    # Login prompt is not visible yet, keep trying to open it first.
                    for sel in [
                        "text=登录",
                        "text=扫码登录",
                        "button:has-text('登录')",
                        "a:has-text('登录')",
                        "div:has-text('登录')",
                    ]:
                        try:
                            btn = await page.query_selector(sel)
                            if btn:
                                await btn.click(timeout=1000)
                                break
                        except Exception:
                            continue
                    await page.wait_for_timeout(1000)
                    continue
                qr_image_base64 = await self._capture_qr_image(page, platform)
                if qr_image_base64:
                    break
                # Retry opening login modal in case page DOM refreshed.
                for sel in [
                    "text=登录",
                    "text=扫码登录",
                    "button:has-text('登录')",
                    "a:has-text('登录')",
                    "div:has-text('登录')",
                ]:
                    try:
                        btn = await page.query_selector(sel)
                        if btn:
                            await btn.click(timeout=1000)
                            break
                    except Exception:
                        continue
                await page.wait_for_timeout(1000)
            if not qr_image_base64:
                await context.close()
                await browser.close()
                await playwright.stop()
                return {
                    "flow_id": "",
                    "platform": platform,
                    "status": "failed",
                    "qr_image_base64": "",
                    "expires_in": 0,
                    "error": "qr_not_found_after_retries",
                }
            baseline_cookies = await context.cookies()
            initial_auth_cookie_values = self._capture_auth_cookie_baseline(platform, baseline_cookies)
            now = time.time()
            ttl = max(60, settings.crawler_auth_flow_ttl_s)
            flow = AuthFlow(
                flow_id=str(uuid.uuid4()),
                platform=platform,
                user_id=user_id,
                created_at=now,
                expires_at=now + ttl,
                region=region,
                playwright=playwright,
                browser=browser,
                context=context,
                page=page,
                initial_auth_cookie_values=initial_auth_cookie_values,
                login_prompt_seen=login_prompt_seen,
                login_prompt_visible_once=login_prompt_seen,
                login_prompt_closed=False,
            )
            self._flows[flow.flow_id] = flow
            return {
                "flow_id": flow.flow_id,
                "platform": platform,
                "status": "pending",
                "qr_image_base64": qr_image_base64,
                "expires_in": ttl,
                "message": "二维码已生成，请扫码并在手机端确认登录",
                "error": None,
            }
        except Exception as exc:
            return {
                "flow_id": "",
                "platform": platform,
                "status": "failed",
                "qr_image_base64": "",
                "expires_in": 0,
                "error": f"start_failed:{exc}",
            }

    async def get_status(self, flow_id: str, manual_confirm: bool = False) -> Dict[str, Any]:
        await self._prune_expired()
        flow = self._flows.get(flow_id)
        if not flow:
            return {
                "flow_id": flow_id,
                "platform": "",
                "user_id": "",
                "status": "expired",
                "expires_in": 0,
                "session_saved": False,
                "error": "flow_not_found_or_expired",
            }

        if time.time() >= flow.expires_at:
            self._flows.pop(flow_id, None)
            await self._close_flow(flow)
            return {
                "flow_id": flow_id,
                "platform": flow.platform,
                "user_id": flow.user_id,
                "status": "expired",
                "expires_in": 0,
                "session_saved": False,
                "error": "flow_expired",
            }

        try:
            cookies = await flow.context.cookies()
            ok, reason = session_store.validate_cookie_bundle(flow.platform, cookies)
            metrics = self._build_auth_metrics(flow.platform, cookies)
            if not ok:
                return {
                    "flow_id": flow_id,
                    "platform": flow.platform,
                    "user_id": flow.user_id,
                    "status": "pending",
                    "expires_in": max(0, int(flow.expires_at - time.time())),
                    "message": "已建立会话，等待关键 Cookie 就绪",
                    "auth_metrics": metrics,
                    "session_saved": False,
                    "error": reason if reason != "missing_required_cookies" else None,
                }
            changed = self._changed_auth_cookie_names(flow, cookies)
            hard_transition = self._has_auth_cookie_transition(flow, changed)
            qr_visible = await self._is_qr_visible(flow.page, flow.platform)
            login_prompt_visible = (await self._is_login_prompt_visible(flow.page, flow.platform)) or qr_visible
            if login_prompt_visible:
                flow.login_prompt_seen = True
                flow.login_prompt_visible_once = True
            elif flow.login_prompt_visible_once:
                flow.login_prompt_closed = True
            elapsed_s = max(0, int(time.time() - flow.created_at))
            metrics["qr_visible"] = qr_visible
            metrics["login_prompt_visible"] = login_prompt_visible
            metrics["login_prompt_closed"] = flow.login_prompt_closed
            metrics["has_cookie_transition"] = hard_transition
            metrics["changed_auth_cookies"] = sorted(changed)
            metrics["has_soft_transition"] = len(changed) > 0
            metrics["elapsed_s"] = elapsed_s
            metrics["manual_confirm"] = manual_confirm
            present_any = set(metrics.get("required_any_present_names") or [])
            has_id_token = "id_token" in present_any
            # `gid` is weaker than id_token/web_session, so only use it in manual-confirm path.
            manual_signal_names = {"id_token", "web_session", "a1", "sec_poison_id", "webid", "webId"}
            has_manual_signal = has_id_token or any(name in manual_signal_names for name in changed)
            required_ready = bool(metrics.get("required_all_ok")) and bool(metrics.get("required_any_ok"))
            strong_cookie_signal = has_id_token or ("web_session" in changed) or ("a1" in changed)
            metrics["login_prompt_seen"] = flow.login_prompt_seen
            metrics["strong_cookie_signal"] = strong_cookie_signal
            auto_authorized = False
            manual_override = False

            if flow.platform == "xiaohongshu":
                # XHS must be explicit: never auto-authorize from cookie transitions.
                # Session can be saved only after user manually confirms.
                # Probe is advisory; do not block manual authorization forever.
                metrics["auto_authorize_disabled"] = True

                if manual_confirm and required_ready:
                    probe_ok, probe_reason = await self._probe_xhs_session_ready(flow.page, cookies)
                    metrics["xhs_probe_ok"] = probe_ok
                    metrics["xhs_probe_reason"] = probe_reason
                    auto_authorized = True
                    manual_override = True
                    metrics["xhs_probe_soft_failed"] = not probe_ok
            else:
                auto_authorized = hard_transition or (manual_confirm and required_ready and has_manual_signal)
                manual_override = bool(auto_authorized and manual_confirm and not hard_transition)

            metrics["manual_override"] = manual_override
            metrics["auto_authorized"] = auto_authorized

            if not auto_authorized:
                pending_message = "检测到关键 Cookie 但仍未确认登录，请在手机端点击确认"
                if has_id_token:
                    pending_message = "已扫码，等待手机端确认完成"
                elif login_prompt_visible:
                    pending_message = "等待扫码并在手机端确认登录"
                elif len(changed) > 0:
                    pending_message = "检测到登录态变化，正在等待会话稳定"
                if manual_confirm and required_ready:
                    probe_reason = str(metrics.get("xhs_probe_reason") or "").strip()
                    pending_message = (
                        f"已触发手动确认，但登录能力探针未通过（{probe_reason}）。请重新扫码后重试"
                        if probe_reason
                        else "已触发手动确认，但仍未检测到可用登录信号（建议在手机端点确认后等待 3-5 秒再点检查）"
                    )
                return {
                    "flow_id": flow_id,
                    "platform": flow.platform,
                    "user_id": flow.user_id,
                    "status": "pending",
                    "expires_in": max(0, int(flow.expires_at - time.time())),
                    "message": pending_message,
                    "auth_metrics": metrics,
                    "session_saved": False,
                    "error": "awaiting_login_confirmation",
                }

            await session_store.upsert_user_session(
                platform=flow.platform,
                user_id=flow.user_id,
                cookies=cookies,
                user_agent=settings.crawler_user_agent_pool.split(",")[0].strip(),
                region=flow.region,
                source="qr_scan_manual_override" if bool(metrics.get("manual_override")) else "qr_scan",
            )
            self._flows.pop(flow_id, None)
            await self._close_flow(flow)
            return {
                "flow_id": flow_id,
                "platform": flow.platform,
                "user_id": flow.user_id,
                "status": "authorized",
                "expires_in": 0,
                "message": "扫码登录成功，会话已保存（手动确认）" if bool(metrics.get("manual_override")) else "扫码登录成功，会话已保存",
                "auth_metrics": metrics,
                "session_saved": True,
                "error": None,
            }
        except Exception as exc:
            return {
                "flow_id": flow_id,
                "platform": flow.platform,
                "user_id": flow.user_id,
                "status": "failed",
                "expires_in": max(0, int(flow.expires_at - time.time())),
                "session_saved": False,
                "error": f"status_check_failed:{exc}",
            }

    async def cancel_flow(self, flow_id: str) -> Dict[str, Any]:
        flow = self._flows.pop(flow_id, None)
        if not flow:
            return {"flow_id": flow_id, "status": "cancelled"}
        await self._close_flow(flow)
        return {"flow_id": flow_id, "status": "cancelled"}

    async def import_cookies(
        self,
        *,
        platform: str,
        user_id: str,
        cookies: list[dict[str, Any]],
        region: str = "",
    ) -> Dict[str, Any]:
        if not cookies:
            return {"success": False, "error": "empty_cookies"}
        ok, reason = session_store.validate_cookie_bundle(platform, cookies)
        if not ok:
            return {"success": False, "error": reason}
        session_id = await session_store.upsert_user_session(
            platform=platform,
            user_id=user_id,
            cookies=cookies,
            region=region,
            source="manual_cookie",
        )
        return {"success": True, "session_id": session_id}


auth_manager = AuthManager()
