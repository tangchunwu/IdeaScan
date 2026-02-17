from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from redis.asyncio import Redis

from app.config import settings


class JobStore:
    def __init__(self) -> None:
        self._redis = Redis.from_url(settings.crawler_redis_url, decode_responses=True)
        self._memory_queue: asyncio.Queue[str] = asyncio.Queue()
        self._memory_job: dict[str, dict[str, Any]] = {}
        self._redis_available: Optional[bool] = None

    async def _use_redis(self) -> bool:
        if self._redis_available is not None:
            return self._redis_available
        try:
            await self._redis.ping()
            self._redis_available = True
        except Exception:
            self._redis_available = False
        return self._redis_available

    def _job_key(self, job_id: str) -> str:
        return f"crawler:job:{job_id}"

    async def enqueue(self, payload: Dict[str, Any]) -> None:
        payload_s = json.dumps(payload, ensure_ascii=False)
        if await self._use_redis():
            await self._redis.rpush(settings.crawler_job_queue_key, payload_s)
            await self._redis.hset(self._job_key(payload["job_id"]), mapping={"status": "queued", "payload": payload_s})
            return
        await self._memory_queue.put(payload_s)
        self._memory_job[payload["job_id"]] = {"status": "queued", "payload": payload}

    async def pop(self, timeout: int = 3) -> Optional[Dict[str, Any]]:
        if await self._use_redis():
            item = await self._redis.blpop(settings.crawler_job_queue_key, timeout=timeout)
            if not item:
                return None
            _, raw = item
            return json.loads(raw)
        try:
            raw = await asyncio.wait_for(self._memory_queue.get(), timeout=timeout)
            return json.loads(raw)
        except asyncio.TimeoutError:
            return None

    async def set_status(self, job_id: str, status: str, extra: Optional[Dict[str, Any]] = None) -> None:
        if await self._use_redis():
            mapping = {"status": status}
            if extra:
                mapping.update({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v) for k, v in extra.items()})
            await self._redis.hset(self._job_key(job_id), mapping=mapping)
            return
        row = self._memory_job.setdefault(job_id, {})
        row["status"] = status
        if extra:
            row.update(extra)

    async def get_status(self, job_id: str) -> Dict[str, Any]:
        if await self._use_redis():
            data = await self._redis.hgetall(self._job_key(job_id))
            if not data:
                return {"job_id": job_id, "status": "not_found"}
            return {"job_id": job_id, **data}
        row = self._memory_job.get(job_id)
        if not row:
            return {"job_id": job_id, "status": "not_found"}
        return {"job_id": job_id, **row}


job_store = JobStore()

