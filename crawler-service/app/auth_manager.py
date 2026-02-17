from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.config import settings
from app.session_store import session_store

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
        "img[src*='qrcode']",
        "img[class*='qrcode']",
        "canvas",
    ],
    "douyin": [
        "img[src*='qrcode']",
        "img[class*='qrcode']",
        "canvas",
    ],
}

SUCCESS_COOKIE_NAMES = {
    "xiaohongshu": {"a1", "web_session", "webId"},
    "douyin": {"sessionid", "sid_guard", "passport_csrf_token", "ttwid"},
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


class AuthManager:
    def __init__(self) -> None:
        self._flows: dict[str, AuthFlow] = {}

    async def _capture_qr_image(self, page: Page, platform: str) -> str:
        selectors = QR_SELECTORS.get(platform, [])
        for selector in selectors:
            try:
                el = await page.query_selector(selector)
                if el:
                    png = await el.screenshot(type="png")
                    return base64.b64encode(png).decode("utf-8")
            except Exception:
                continue
        png = await page.screenshot(type="png", full_page=False)
        return base64.b64encode(png).decode("utf-8")

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
            proxy: Optional[dict[str, str]] = None
            if settings.crawler_default_proxy_server:
                proxy = {"server": settings.crawler_default_proxy_server}
                if settings.crawler_default_proxy_username:
                    proxy["username"] = settings.crawler_default_proxy_username
                if settings.crawler_default_proxy_password:
                    proxy["password"] = settings.crawler_default_proxy_password

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

            await page.wait_for_timeout(1800)
            qr_image_base64 = await self._capture_qr_image(page, platform)
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
            )
            self._flows[flow.flow_id] = flow
            return {
                "flow_id": flow.flow_id,
                "platform": platform,
                "status": "pending",
                "qr_image_base64": qr_image_base64,
                "expires_in": ttl,
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

    async def get_status(self, flow_id: str) -> Dict[str, Any]:
        await self._prune_expired()
        flow = self._flows.get(flow_id)
        if not flow:
            return {
                "flow_id": flow_id,
                "platform": "",
                "user_id": "",
                "status": "expired",
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
                "session_saved": False,
                "error": "flow_expired",
            }

        try:
            cookies = await flow.context.cookies()
            cookie_names = {str(item.get("name", "")) for item in cookies}
            required = SUCCESS_COOKIE_NAMES.get(flow.platform, set())
            authorized = any(name in cookie_names for name in required)
            if not authorized:
                return {
                    "flow_id": flow_id,
                    "platform": flow.platform,
                    "user_id": flow.user_id,
                    "status": "pending",
                    "session_saved": False,
                    "error": None,
                }

            await session_store.upsert_user_session(
                platform=flow.platform,
                user_id=flow.user_id,
                cookies=cookies,
                user_agent=settings.crawler_user_agent_pool.split(",")[0].strip(),
                region=flow.region,
                source="qr_scan",
            )
            self._flows.pop(flow_id, None)
            await self._close_flow(flow)
            return {
                "flow_id": flow_id,
                "platform": flow.platform,
                "user_id": flow.user_id,
                "status": "authorized",
                "session_saved": True,
                "error": None,
            }
        except Exception as exc:
            return {
                "flow_id": flow_id,
                "platform": flow.platform,
                "user_id": flow.user_id,
                "status": "failed",
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
        session_id = await session_store.upsert_user_session(
            platform=platform,
            user_id=user_id,
            cookies=cookies,
            region=region,
            source="manual_cookie",
        )
        return {"success": True, "session_id": session_id}


auth_manager = AuthManager()

