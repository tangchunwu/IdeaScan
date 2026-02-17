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


class XiaohongshuAdapter(BaseAdapter):
    platform = "xiaohongshu"

    def __init__(self, risk: RiskController) -> None:
        self.risk = risk

    async def crawl(self, payload: CrawlerJobPayload) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
        started = time.time()
        if not self.risk.check_rate_limit(self.platform):
            return (
                CrawlerPlatformResult(
                    platform=self.platform,
                    success=False,
                    error="rate_limited",
                    latency_ms=int((time.time() - started) * 1000),
                ),
                {"external_api_calls": 0, "proxy_calls": 0, "est_cost": 0.0, "provider_mix": {"xiaohongshu": 0.0}},
            )

        notes: list[CrawlerNormalizedNote] = []
        comments: list[CrawlerNormalizedComment] = []
        external_calls = 0
        session_error = ""

        if payload.user_id:
            session = await session_store.get_user_session(platform=self.platform, user_id=payload.user_id)
            if session:
                try:
                    session_result, session_cost = await crawl_with_user_session(self.platform, payload, session)
                    if session_result.success and session_result.notes:
                        return session_result, session_cost
                    session_error = session_result.error or "session_crawl_failed"
                except Exception as exc:
                    session_error = f"session_crawl_exception:{exc}"

        token = settings.tikhub_token
        if token:
            headers = {"Authorization": f"Bearer {token}", "User-Agent": self.risk.user_agents.sample()}
            timeout = httpx.Timeout(settings.crawler_http_timeout_s)
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    query = payload.query
                    res = await client.get(
                        "https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes",
                        params={"keyword": query, "page": 1, "sort": "general", "noteType": "_0"},
                        headers=headers,
                    )
                    external_calls += 1
                    if res.status_code == 200:
                        items = (res.json() or {}).get("data", {}).get("data", {}).get("items", [])
                        for raw in items[: payload.limits.notes]:
                            note = raw.get("note", {})
                            note_id = str(note.get("id", ""))
                            notes.append(
                                CrawlerNormalizedNote(
                                    id=note_id,
                                    title=str(note.get("title", "")),
                                    desc=str(note.get("desc", "")),
                                    liked_count=int(note.get("liked_count", 0) or 0),
                                    comments_count=int(note.get("comments_count", 0) or 0),
                                    collected_count=int(note.get("collected_count", 0) or 0),
                                    published_at=str(note.get("time") or note.get("publish_time") or ""),
                                    platform=self.platform,
                                    url=f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else None,
                                )
                            )

                            if not note_id:
                                continue
                            comment_res = await client.get(
                                "https://api.tikhub.io/api/v1/xiaohongshu/web/get_note_comments",
                                params={"note_id": note_id},
                                headers=headers,
                            )
                            external_calls += 1
                            if comment_res.status_code != 200:
                                continue
                            raw_comments = (comment_res.json() or {}).get("data", {}).get("data", {}).get("comments", [])
                            for c in raw_comments[: payload.limits.comments_per_note]:
                                comments.append(
                                    CrawlerNormalizedComment(
                                        id=str(c.get("id", "")),
                                        content=str(c.get("content", "")),
                                        like_count=int(c.get("like_count", 0) or 0),
                                        user_nickname=str((c.get("user") or {}).get("nickname", "")),
                                        ip_location=str(c.get("ip_location", "")),
                                        published_at=str(c.get("create_time") or c.get("time") or ""),
                                        platform=self.platform,
                                        parent_id=None,
                                    )
                                )
            except Exception:
                notes = []
                comments = []
        success = len(notes) > 0
        source = "xiaohongshu_tikhub"
        if success and payload.user_id:
            source = "xiaohongshu_session"
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
