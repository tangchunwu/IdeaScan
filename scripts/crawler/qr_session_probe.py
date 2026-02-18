#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import platform as sys_platform
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple


ROOT = Path(__file__).resolve().parents[2]
CRAWLER_DIR = ROOT / "crawler-service"
if str(CRAWLER_DIR) not in sys.path:
    sys.path.insert(0, str(CRAWLER_DIR))

from app.adapters.douyin_adapter import DouyinAdapter
from app.adapters.xiaohongshu_adapter import XiaohongshuAdapter
from app.auth_manager import auth_manager
from app.config import settings
from app.models import CrawlerJobLimits, CrawlerJobPayload
from app.risk_control import RiskController
from app.session_store import (
    SESSION_REQUIRED_ALL_COOKIES,
    SESSION_REQUIRED_ANY_COOKIES,
    session_store,
)


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 12:
        return "*" * len(value)
    return f"{value[:6]}...{value[-4:]}"


def _open_file(path: Path) -> Tuple[bool, str]:
    system = sys_platform.system().lower()
    try:
        if "darwin" in system:
            subprocess.Popen(["open", str(path)])
            return True, "open"
        if "linux" in system:
            subprocess.Popen(["xdg-open", str(path)])
            return True, "xdg-open"
        if "windows" in system:
            subprocess.Popen(["cmd", "/c", "start", "", str(path)])
            return True, "start"
        return False, f"unsupported_platform:{system}"
    except Exception as exc:
        return False, str(exc)


def _cookie_map(cookies: List[Dict[str, Any]]) -> Dict[str, str]:
    return {
        str(item.get("name", "")).strip(): str(item.get("value", "")).strip()
        for item in cookies
        if str(item.get("name", "")).strip()
    }


def _cookie_focus(platform: str) -> List[str]:
    if platform == "xiaohongshu":
        return [
            "a1",
            "web_session",
            "gid",
            "webid",
            "webBuild",
            "xsecappid",
            "sec_poison_id",
            "websectiga",
        ]
    return ["sessionid", "sessionid_ss", "sid_guard", "ttwid"]


def _inspect_cookie_usability(platform: str, cookies: List[Dict[str, Any]]) -> Dict[str, Any]:
    cookie_map = _cookie_map(cookies)
    required_all = SESSION_REQUIRED_ALL_COOKIES.get(platform, set())
    required_any = SESSION_REQUIRED_ANY_COOKIES.get(platform, set())
    focus = _cookie_focus(platform)

    rows: List[Dict[str, Any]] = []
    for name in focus:
        value = cookie_map.get(name, "")
        rows.append(
            {
                "name": name,
                "present": bool(value),
                "masked_value": _mask(value),
                "value_len": len(value),
                "required_by_validator": bool(name in required_all or name in required_any),
                "usable_in_browser_context": bool(value),
            }
        )

    required_all_ok = all(cookie_map.get(name) for name in required_all) if required_all else True
    required_any_ok = (any(cookie_map.get(name) for name in required_any) if required_any else True)
    validator_ok = required_all_ok and required_any_ok

    return {
        "required_all": sorted(required_all),
        "required_any": sorted(required_any),
        "validator_ok": validator_ok,
        "cookies_checked": rows,
        "cookie_count_total": len(cookie_map),
    }


async def _smoke_crawl(platform: str, user_id: str, query: str) -> Dict[str, Any]:
    risk = RiskController(
        session_pool_size=max(1, int(settings.crawler_session_pool_size)),
        user_agent_pool=settings.crawler_user_agent_pool,
    )
    payload = CrawlerJobPayload(
        validation_id=f"qr-probe-{uuid.uuid4().hex[:8]}",
        trace_id=f"qr-probe-{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        query=query,
        platforms=[platform],  # type: ignore[list-item]
        mode="quick",
        limits=CrawlerJobLimits(notes=3, comments_per_note=5),
        freshness_days=14,
        timeout_ms=20000,
    )
    if platform == "xiaohongshu":
        adapter = XiaohongshuAdapter(risk)
    else:
        adapter = DouyinAdapter(risk)

    result, cost = await adapter.crawl(payload)
    return {
        "success": result.success,
        "error": result.error,
        "latency_ms": result.latency_ms,
        "notes": len(result.notes),
        "comments": len(result.comments),
        "sample_note_titles": [item.title for item in result.notes[:3]],
        "sample_comments": [item.content[:60] for item in result.comments[:3] if item.content],
        "provider_mix": cost.get("provider_mix", {}),
    }


async def _run(args: argparse.Namespace) -> int:
    start = await auth_manager.start_flow(platform=args.platform, user_id=args.user_id, region=args.region)
    if start.get("status") != "pending":
        print(json.dumps({"ok": False, "step": "start_flow", "detail": start}, ensure_ascii=False, indent=2))
        return 1

    flow_id = str(start.get("flow_id") or "")
    qr_base64 = str(start.get("qr_image_base64") or "")
    expires_in = int(start.get("expires_in") or 0)
    if not flow_id or not qr_base64:
        print(json.dumps({"ok": False, "step": "start_flow", "detail": start}, ensure_ascii=False, indent=2))
        return 1

    output_dir = ROOT / ".tmp-ref" / "qr-auth"
    output_dir.mkdir(parents=True, exist_ok=True)
    qr_path = output_dir / f"{args.platform}-{args.user_id[:8]}-{flow_id[:8]}.png"
    qr_path.write_bytes(base64.b64decode(qr_base64))

    open_result: Dict[str, Any] = {"requested": bool(args.open), "opened": False, "method": "", "error": ""}
    if args.open:
        opened, detail = _open_file(qr_path)
        open_result.update(
            {
                "opened": opened,
                "method": detail if opened else "",
                "error": "" if opened else detail,
            }
        )

    print(
        json.dumps(
            {
                "ok": True,
                "step": "qr_ready",
                "flow_id": flow_id,
                "platform": args.platform,
                "user_id": args.user_id,
                "qr_path": str(qr_path),
                "expires_in": expires_in,
                "open_result": open_result,
                "hint": "请用APP扫码，并在手机确认登录",
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    deadline = time.time() + max(args.wait_timeout_s, 10)
    last_status = ""
    try:
        while time.time() < deadline:
            status = await auth_manager.get_status(flow_id)
            state = str(status.get("status") or "")
            left = int(status.get("expires_in") or 0)
            if state != last_status:
                print(json.dumps({"step": "poll", "status": state, "expires_in": left}, ensure_ascii=False))
                last_status = state
            if state == "authorized":
                session = await session_store.get_user_session(platform=args.platform, user_id=args.user_id)
                if not session:
                    print(json.dumps({"ok": False, "step": "session_read", "error": "authorized_but_no_session_found"}, ensure_ascii=False))
                    return 1

                valid, reason = session_store.validate_session_payload(args.platform, session)
                cookies = list(session.get("cookies") or [])
                cookie_report = _inspect_cookie_usability(args.platform, cookies)
                smoke = await _smoke_crawl(args.platform, args.user_id, args.query)
                result = {
                    "ok": True,
                    "step": "authorized",
                    "session_summary": {
                        "session_id": session.get("session_id"),
                        "platform": session.get("platform"),
                        "status": session.get("status"),
                        "source": session.get("source"),
                        "consecutive_failures": session.get("consecutive_failures"),
                        "updated_at": session.get("updated_at"),
                        "validator_ok": valid,
                        "validator_reason": reason,
                    },
                    "cookie_report": cookie_report,
                    "smoke_crawl": smoke,
                }
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 0
            if state in {"expired", "failed", "cancelled"}:
                print(json.dumps({"ok": False, "step": "poll", "detail": status}, ensure_ascii=False, indent=2))
                return 1
            await asyncio.sleep(max(args.poll_interval_s, 1))
    finally:
        # best-effort cleanup if still pending
        status = await auth_manager.get_status(flow_id)
        if str(status.get("status") or "") == "pending":
            await auth_manager.cancel_flow(flow_id)

    print(json.dumps({"ok": False, "step": "timeout", "message": "等待扫码超时，请重试"}, ensure_ascii=False, indent=2))
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Crawler 扫码会话探针（后端直连）")
    parser.add_argument("--platform", choices=["xiaohongshu", "douyin"], default="xiaohongshu")
    parser.add_argument("--user-id", required=True, help="业务用户 ID（UUID）")
    parser.add_argument("--region", default="", help="可选地区标签")
    parser.add_argument("--query", default="AI 辅助健身", help="授权成功后用于 smoke crawl 的关键词")
    parser.add_argument("--poll-interval-s", type=int, default=2)
    parser.add_argument("--wait-timeout-s", type=int, default=180)
    parser.add_argument("--open", action="store_true", help="生成二维码后自动调用系统查看器打开")
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
