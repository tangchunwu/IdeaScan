from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, Tuple

from app.models import CrawlerJobPayload, CrawlerPlatformResult


class BaseAdapter(ABC):
    platform: str

    @abstractmethod
    async def crawl(self, payload: CrawlerJobPayload) -> Tuple[CrawlerPlatformResult, Dict[str, float]]:
        raise NotImplementedError

