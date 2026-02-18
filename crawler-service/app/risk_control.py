from __future__ import annotations

import random
from dataclasses import dataclass
from time import monotonic
from typing import Dict, List


@dataclass
class TokenBucket:
    rate: float
    capacity: float
    tokens: float
    last_refill: float

    def allow(self, cost: float = 1.0) -> bool:
        now = monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False


class SessionPool:
    def __init__(self, size: int) -> None:
        self._sessions = [f"session-{i}" for i in range(max(1, size))]
        self._index = 0

    def next(self) -> str:
        value = self._sessions[self._index % len(self._sessions)]
        self._index += 1
        return value


class UserAgentPool:
    def __init__(self, raw_pool: str) -> None:
        parsed = [item.strip() for item in raw_pool.split(",") if item.strip()]
        self._pool = parsed or ["Mozilla/5.0"]

    def sample(self) -> str:
        return random.choice(self._pool)


class RiskController:
    def __init__(self, session_pool_size: int, user_agent_pool: str) -> None:
        self.session_pool = SessionPool(session_pool_size)
        self.user_agents = UserAgentPool(user_agent_pool)
        self._buckets: Dict[str, TokenBucket] = {}
        self._last_seen: Dict[str, float] = {}

    def check_rate_limit(self, key: str, rate: float = 2.0, capacity: float = 4.0) -> bool:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = TokenBucket(rate=rate, capacity=capacity, tokens=capacity, last_refill=monotonic())
            self._buckets[key] = bucket
        return bucket.allow()

    def check_cooldown(self, key: str, min_interval_s: float) -> bool:
        if min_interval_s <= 0:
            return True
        now = monotonic()
        last = self._last_seen.get(key)
        if last is not None and (now - last) < min_interval_s:
            return False
        self._last_seen[key] = now
        return True
