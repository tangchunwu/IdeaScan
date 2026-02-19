from __future__ import annotations

import time
from typing import Dict, Tuple

import httpx

from app.adapters.base import BaseAdapter
from app.browser_scraper import crawl_with_user_session
from app.config import settings
from app.models import (
    CrawlerJobPayload,
    CrawlerNormalizedComment,
    CrawlerNormalizedNote,
    CrawlerPlatformResult,
)
from app.risk_control import RiskController
from app.session_store import session_store


class DouyinAdapter(BaseAdapter):
    platform = "douyin"

    def __init__(self, risk: RiskController) -> None:
        self.risk = risk

    @staticmethod
    def _should_count_session_failure(error: str) -> bool:
        err = str(error or "").strip().lower()
        if not err:
            return True
        non_auth_fail_prefixes = (
            "session_crawl_empty",
            "notes_found_but_comments_empty",
            "crawl_empty",
            "rate_limited",
            "daily_budget_exceeded",
            "crawl_deadline_reached",
            "step_timeout",
        )
        return not err.startswith(non_auth_fail_prefixes)

    async def crawl(self, payload: CrawlerJobPayload) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
        started = time.time()
        rate = 0.8 if payload.mode == "quick" else 1.6
        capacity = 2.0 if payload.mode == "quick" else 4.0
        if not self.risk.check_rate_limit(self.platform, rate=rate, capacity=capacity):
            return (
                CrawlerPlatformResult(
                    platform=self.platform,
                    success=False,
                    error="rate_limited",
                    latency_ms=int((time.time() - started) * 1000),
                ),
                {"external_api_calls": 0, "proxy_calls": 0, "est_cost": 0.0, "provider_mix": {"douyin": 0.0}},
            )

        notes: list[CrawlerNormalizedNote] = []
        comments: list[CrawlerNormalizedComment] = []
        external_calls = 0
        token = settings.tikhub_token
        session_error = ""

        if payload.user_id:
            session, invalid_reason = await session_store.get_valid_user_session(platform=self.platform, user_id=payload.user_id)
            if session:
                try:
                    session_result, session_cost = await crawl_with_user_session(self.platform, payload, session)
                    if session_result.success and session_result.notes and session_result.comments:
                        await session_store.touch_user_session(platform=self.platform, user_id=payload.user_id)
                        await session_store.mark_session_result(platform=self.platform, user_id=payload.user_id, success=True)
                        return session_result, session_cost
                    session_error = session_result.error or "session_crawl_failed"
                    if self._should_count_session_failure(session_error):
                        await session_store.mark_session_result(
                            platform=self.platform,
                            user_id=payload.user_id,
                            success=False,
                            error=session_error,
                        )
                except Exception as exc:
                    session_error = f"session_crawl_exception:{exc}"
                    await session_store.mark_session_result(
                        platform=self.platform,
                        user_id=payload.user_id,
                        success=False,
                        error=session_error,
                    )
            elif invalid_reason:
                session_error = invalid_reason

        if token:
            headers = {"Authorization": f"Bearer {token}", "User-Agent": self.risk.user_agents.sample()}
            timeout = httpx.Timeout(settings.crawler_http_timeout_s)
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    res = await client.get(
                        "https://api.tikhub.io/api/v1/douyin/web/fetch_video_search_result",
                        params={"keyword": payload.query, "offset": 0, "count": payload.limits.notes, "sort_type": 0},
                        headers=headers,
                    )
                    external_calls += 1
                    if res.status_code == 200:
                        aweme_list = (res.json() or {}).get("data", {}).get("data", {}).get("aweme_list", [])
                        for raw in aweme_list[: payload.limits.notes]:
                            aweme_id = str(raw.get("aweme_id", ""))
                            stats = raw.get("statistics") or {}
                            notes.append(
                                CrawlerNormalizedNote(
                                    id=aweme_id,
                                    title=str(raw.get("desc", ""))[:40],
                                    desc=str(raw.get("desc", "")),
                                    liked_count=int(stats.get("digg_count", 0) or 0),
                                    comments_count=int(stats.get("comment_count", 0) or 0),
                                    collected_count=0,
                                    published_at=str(raw.get("create_time") or ""),
                                    platform=self.platform,
                                    url=f"https://www.douyin.com/video/{aweme_id}" if aweme_id else None,
                                )
                            )
                            if not aweme_id:
                                continue
                            comment_res = await client.get(
                                "https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments",
                                params={"aweme_id": aweme_id, "cursor": 0, "count": payload.limits.comments_per_note},
                                headers=headers,
                            )
                            external_calls += 1
                            if comment_res.status_code != 200:
                                continue
                            raw_comments = (comment_res.json() or {}).get("data", {}).get("data", {}).get("comments", [])
                            for c in raw_comments[: payload.limits.comments_per_note]:
                                comments.append(
                                    CrawlerNormalizedComment(
                                        id=str(c.get("cid", "")),
                                        content=str(c.get("text", "")),
                                        like_count=int(c.get("digg_count", 0) or 0),
                                        user_nickname=str((c.get("user") or {}).get("nickname", "")),
                                        ip_location=str(c.get("ip_label", "")),
                                        published_at=str(c.get("create_time") or ""),
                                        platform=self.platform,
                                    )
                                )
            except Exception:
                notes = []
                comments = []
        success = len(notes) > 0 and len(comments) > 0
        if len(notes) > 0 and len(comments) <= 0 and not session_error:
            session_error = "notes_found_but_comments_empty"
        source = "douyin_tikhub"
        if success and payload.user_id:
            source = "douyin_session"
        if not token and not success and not session_error:
            session_error = "no_tikhub_token_and_no_user_session"

        return (
            CrawlerPlatformResult(
                platform=self.platform,
                notes=notes,
                comments=comments,
                success=success,
                latency_ms=int((time.time() - started) * 1000),
                error=None if success else session_error or "crawl_empty",
            ),
            {
                "external_api_calls": external_calls,
                "proxy_calls": 0,
                "est_cost": round(external_calls * 0.0004, 6),
                "provider_mix": {source: 1.0 if success else 0.0},
            },
        )
