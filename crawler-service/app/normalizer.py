from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from app.models import CrawlerPlatformResult


def _to_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def calc_freshness_score(results: Iterable[CrawlerPlatformResult]) -> float:
    now = datetime.now(timezone.utc)
    points = []
    for item in results:
        for note in item.notes:
            dt = _to_dt(note.published_at)
            if dt is None:
                points.append(0.2)
                continue
            age_days = max(0.0, (now - dt).total_seconds() / 86400)
            if age_days <= 2:
                points.append(1.0)
            elif age_days <= 7:
                points.append(0.75)
            elif age_days <= 14:
                points.append(0.45)
            else:
                points.append(0.2)
    if not points:
        return 0.0
    return round(sum(points) / len(points) * 100, 3)


def calc_dup_ratio(results: Iterable[CrawlerPlatformResult]) -> float:
    seen = set()
    total = 0
    dup = 0
    for item in results:
        for note in item.notes:
            total += 1
            key = (item.platform, note.id or note.title.strip().lower())
            if key in seen:
                dup += 1
            else:
                seen.add(key)
        for comment in item.comments:
            total += 1
            key = (item.platform, comment.id or comment.content.strip().lower())
            if key in seen:
                dup += 1
            else:
                seen.add(key)
    if total == 0:
        return 0.0
    return round(dup / total, 6)

