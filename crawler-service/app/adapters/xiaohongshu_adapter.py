from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Dict, Tuple

import httpx

from app.adapters.base import BaseAdapter
from app.config import settings
from app.models import (
    CrawlerJobPayload,
    CrawlerNormalizedComment,
    CrawlerNormalizedNote,
    CrawlerPlatformResult,
)
from app.risk_control import RiskController


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

        if not notes:
            now = datetime.now(timezone.utc).isoformat()
            for idx in range(max(1, payload.limits.notes // 2)):
                notes.append(
                    CrawlerNormalizedNote(
                        id=f"xhs-demo-{idx}",
                        title=f"{payload.query} 用户讨论样本 {idx + 1}",
                        desc=f"模拟抓取内容，用于联调流程。关键词: {payload.query}",
                        liked_count=10 + idx * 3,
                        comments_count=3 + idx,
                        collected_count=2 + idx,
                        published_at=now,
                        platform=self.platform,
                        url="",
                    )
                )
            for idx in range(max(2, payload.limits.comments_per_note)):
                comments.append(
                    CrawlerNormalizedComment(
                        id=f"xhs-demo-c-{idx}",
                        content=f"这是关于 {payload.query} 的模拟评论 {idx + 1}",
                        like_count=idx,
                        user_nickname="demo_user",
                        ip_location="",
                        published_at=now,
                        platform=self.platform,
                    )
                )

        return (
            CrawlerPlatformResult(
                platform=self.platform,
                notes=notes,
                comments=comments,
                success=True,
                latency_ms=int((time.time() - started) * 1000),
            ),
            {
                "external_api_calls": external_calls,
                "proxy_calls": 0,
                "est_cost": round(external_calls * 0.0004, 6),
                "provider_mix": {"xiaohongshu": 1.0},
            },
        )

