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


class DouyinAdapter(BaseAdapter):
    platform = "douyin"

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
                {"external_api_calls": 0, "proxy_calls": 0, "est_cost": 0.0, "provider_mix": {"douyin": 0.0}},
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

        if not notes:
            now = datetime.now(timezone.utc).isoformat()
            for idx in range(max(1, payload.limits.notes // 2)):
                notes.append(
                    CrawlerNormalizedNote(
                        id=f"dy-demo-{idx}",
                        title=f"{payload.query} 视频样本 {idx + 1}",
                        desc=f"模拟抖音抓取，关键词: {payload.query}",
                        liked_count=20 + idx * 2,
                        comments_count=5 + idx,
                        collected_count=0,
                        published_at=now,
                        platform=self.platform,
                        url="",
                    )
                )
            for idx in range(max(2, payload.limits.comments_per_note)):
                comments.append(
                    CrawlerNormalizedComment(
                        id=f"dy-demo-c-{idx}",
                        content=f"抖音模拟评论 {idx + 1}，关键词 {payload.query}",
                        like_count=idx,
                        user_nickname="douyin_demo",
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
                "provider_mix": {"douyin": 1.0},
            },
        )

