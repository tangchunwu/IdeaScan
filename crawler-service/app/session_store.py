from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from redis.asyncio import Redis

from app.config import settings


class SessionStore:
    def __init__(self) -> None:
        self._redis = Redis.from_url(settings.crawler_redis_url, decode_responses=True)
        self._redis_available: Optional[bool] = None
        self._memory_sessions: dict[str, dict[str, Any]] = {}

    async def _use_redis(self) -> bool:
        if self._redis_available is not None:
            return self._redis_available
        try:
            await self._redis.ping()
            self._redis_available = True
        except Exception:
            self._redis_available = False
        return self._redis_available

    @staticmethod
    def _key(platform: str, user_id: str) -> str:
        return f"crawler:session:{platform}:{user_id}"

    @staticmethod
    def _index_key(user_id: str) -> str:
        return f"crawler:session:index:{user_id}"

    async def upsert_user_session(
        self,
        *,
        platform: str,
        user_id: str,
        cookies: List[Dict[str, Any]],
        user_agent: str = "",
        region: str = "",
        source: str = "qr_scan",
    ) -> str:
        now = datetime.now(timezone.utc).isoformat()
        session_id = f"{platform}:{user_id}:{int(datetime.now(timezone.utc).timestamp())}"
        payload = {
            "session_id": session_id,
            "platform": platform,
            "user_id": user_id,
            "status": "active",
            "cookies": cookies,
            "user_agent": user_agent,
            "region": region,
            "source": source,
            "created_at": now,
            "updated_at": now,
        }
        key = self._key(platform, user_id)

        if await self._use_redis():
            await self._redis.set(key, json.dumps(payload, ensure_ascii=False))
            await self._redis.sadd(self._index_key(user_id), key)
            return session_id

        self._memory_sessions[key] = payload
        return session_id

    async def get_user_session(self, *, platform: str, user_id: str) -> Optional[Dict[str, Any]]:
        key = self._key(platform, user_id)
        if await self._use_redis():
            raw = await self._redis.get(key)
            if not raw:
                return None
            try:
                return json.loads(raw)
            except Exception:
                return None
        return self._memory_sessions.get(key)

    async def delete_user_session(self, *, platform: str, user_id: str) -> bool:
        key = self._key(platform, user_id)
        if await self._use_redis():
            deleted = await self._redis.delete(key)
            await self._redis.srem(self._index_key(user_id), key)
            return bool(deleted)
        return self._memory_sessions.pop(key, None) is not None

    async def list_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        if await self._use_redis():
            keys = await self._redis.smembers(self._index_key(user_id))
            rows: List[Dict[str, Any]] = []
            for key in keys:
                raw = await self._redis.get(key)
                if not raw:
                    continue
                try:
                    rows.append(json.loads(raw))
                except Exception:
                    continue
            return rows

        rows = []
        for row in self._memory_sessions.values():
            if row.get("user_id") == user_id:
                rows.append(row)
        return rows


session_store = SessionStore()

