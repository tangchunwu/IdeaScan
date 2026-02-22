from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from redis.asyncio import Redis

from app.config import settings

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:  # pragma: no cover - optional dependency fallback
    Fernet = None  # type: ignore[assignment]
    InvalidToken = Exception  # type: ignore[assignment]


# Login-state cookie requirements.
# xiaohongshu: both `web_session` and `a1` are required to reduce false positives
# from anonymous visitor cookies.
# douyin: any one of authenticated session cookies is acceptable.
SESSION_REQUIRED_ALL_COOKIES = {
    "xiaohongshu": {"web_session", "a1"},
}

SESSION_REQUIRED_ANY_COOKIES = {
    # xiaohongshu may not always expose `id_token` in web login.
    # Accept any one of strong login-side cookies as signal.
    "xiaohongshu": {"id_token", "gid", "webid", "webId"},
    "douyin": {"sessionid", "sessionid_ss", "sid_guard"},
}

AUTO_EVICT_REASONS = {
    "inactive_session",
    "empty_cookies",
    "missing_required_cookies",
    "invalid_updated_at",
    "session_stale",
    "cookies_expired",
    "session_fail_threshold_reached",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SessionStore:
    def __init__(self) -> None:
        self._redis = Redis.from_url(settings.crawler_redis_url, decode_responses=True)
        self._redis_available: Optional[bool] = None
        self._memory_sessions: dict[str, dict[str, Any]] = {}
        self._fernet = self._build_fernet(settings.crawler_session_encryption_key)

    @staticmethod
    def _build_fernet(secret: str) -> Optional[Fernet]:
        if not secret or Fernet is None:
            return None
        try:
            # Accept either raw secret string or already urlsafe-base64 32-byte key.
            if len(secret) == 44 and all(c.isalnum() or c in "-_=" for c in secret):
                key = secret.encode("utf-8")
            else:
                digest = hashlib.sha256(secret.encode("utf-8")).digest()
                key = base64.urlsafe_b64encode(digest)
            return Fernet(key)
        except Exception:
            return None

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

    @staticmethod
    def _proxy_binding_key(platform: str, user_id: str) -> str:
        return f"crawler:proxy_binding:{platform}:{user_id}"

    @staticmethod
    def _should_auto_evict(reason: str) -> bool:
        return reason in AUTO_EVICT_REASONS

    def _serialize(self, payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, ensure_ascii=False)
        if not self._fernet:
            return raw
        token = self._fernet.encrypt(raw.encode("utf-8")).decode("utf-8")
        return f"enc:{token}"

    def _deserialize(self, raw: str) -> Optional[Dict[str, Any]]:
        try:
            if raw.startswith("enc:"):
                if not self._fernet:
                    return None
                token = raw[4:]
                decrypted = self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")
                parsed = json.loads(decrypted)
            else:
                parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
            return None
        except InvalidToken:
            return None
        except Exception:
            return None

    async def _save_payload(self, key: str, payload: Dict[str, Any]) -> None:
        if await self._use_redis():
            await self._redis.set(key, self._serialize(payload))
        else:
            self._memory_sessions[key] = payload

    def _build_proxy_from_binding(self, binding: Dict[str, Any]) -> Dict[str, str] | None:
        server_raw = str(settings.crawler_default_proxy_server or "").strip()
        if not server_raw:
            return None

        session_key = str(binding.get("session_key") or "")
        server = server_raw
        username = str(settings.crawler_default_proxy_username or "").strip()
        password = str(settings.crawler_default_proxy_password or "").strip()
        if "://" not in server:
            scheme = str(settings.crawler_proxy_scheme or "socks5").strip().lower() or "socks5"
            server = f"{scheme}://{server}"
        if session_key:
            server = server.replace("{session}", session_key)
            username = username.replace("{session}", session_key)
            password = password.replace("{session}", session_key)

        proxy: Dict[str, str] = {"server": server}
        if username:
            proxy["username"] = username
        if password:
            proxy["password"] = password
        return proxy

    async def acquire_proxy_binding(self, *, platform: str, user_id: str) -> Dict[str, Any]:
        mode = str(settings.crawler_proxy_mode or "sticky_user").strip().lower()
        if mode == "off":
            return {"proxy": None, "proxy_binding_id": "", "proxy_rotated": False}

        server = str(settings.crawler_default_proxy_server or "").strip()
        if not server:
            return {"proxy": None, "proxy_binding_id": "", "proxy_rotated": False}

        if mode == "global":
            binding = {"binding_id": "global", "session_key": "global"}
            return {
                "proxy": self._build_proxy_from_binding(binding),
                "proxy_binding_id": "global",
                "proxy_rotated": False,
            }

        # sticky_user mode: keep a per-user binding in Redis/memory with TTL and fail counter.
        now_ts = int(time.time())
        ttl_s = max(60, int(settings.crawler_proxy_sticky_ttl_s))
        rotate_threshold = max(1, int(settings.crawler_proxy_rotate_on_fails))
        key = self._proxy_binding_key(platform, user_id)

        payload: Dict[str, Any] | None = None
        if await self._use_redis():
            raw = await self._redis.get(key)
            if raw:
                payload = self._deserialize(raw)
        else:
            value = self._memory_sessions.get(key)
            payload = value if isinstance(value, dict) else None

        rotated = False
        expires_at = int(payload.get("expires_at") or 0) if payload else 0
        failures = int(payload.get("failures") or 0) if payload else 0
        if (
            not payload
            or not payload.get("session_key")
            or now_ts >= expires_at
            or failures >= rotate_threshold
        ):
            session_key = secrets.token_hex(8)
            payload = {
                "platform": platform,
                "user_id": user_id,
                "binding_id": f"{platform}:{user_id}:{session_key[:6]}",
                "session_key": session_key,
                "created_at": now_ts,
                "updated_at": now_ts,
                "expires_at": now_ts + ttl_s,
                "failures": 0,
            }
            rotated = True
            await self._save_payload(key, payload)
        else:
            payload["updated_at"] = now_ts
            await self._save_payload(key, payload)

        return {
            "proxy": self._build_proxy_from_binding(payload),
            "proxy_binding_id": str(payload.get("binding_id") or ""),
            "proxy_rotated": rotated,
        }

    async def mark_proxy_binding_result(self, *, platform: str, user_id: str, success: bool) -> None:
        mode = str(settings.crawler_proxy_mode or "sticky_user").strip().lower()
        if mode != "sticky_user":
            return
        key = self._proxy_binding_key(platform, user_id)

        payload: Dict[str, Any] | None = None
        if await self._use_redis():
            raw = await self._redis.get(key)
            if not raw:
                return
            payload = self._deserialize(raw)
        else:
            value = self._memory_sessions.get(key)
            payload = value if isinstance(value, dict) else None
        if not payload:
            return
        if success:
            payload["failures"] = 0
        else:
            payload["failures"] = int(payload.get("failures") or 0) + 1
        payload["updated_at"] = int(time.time())
        await self._save_payload(key, payload)

    @staticmethod
    def validate_cookie_bundle(platform: str, cookies: List[Dict[str, Any]]) -> Tuple[bool, str]:
        if not cookies:
            return False, "empty_cookies"
        cookie_map = {
            str(item.get("name", "")).strip(): str(item.get("value", "")).strip()
            for item in cookies
            if str(item.get("name", "")).strip()
        }

        required_all = SESSION_REQUIRED_ALL_COOKIES.get(platform, set())
        if required_all:
            missing = [name for name in required_all if not cookie_map.get(name)]
            if missing:
                return False, "missing_required_cookies"

        required_any = SESSION_REQUIRED_ANY_COOKIES.get(platform, set())
        if required_any and not any(cookie_map.get(name) for name in required_any):
            return False, "missing_required_cookies"
        return True, ""

    def validate_session_payload(self, platform: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
        if payload.get("status") not in ("active", "degraded"):
            return False, "inactive_session"
        cookies = payload.get("cookies")
        if not isinstance(cookies, list) or not cookies:
            return False, "empty_cookies"

        ok, reason = self.validate_cookie_bundle(platform, cookies)
        if not ok:
            return False, reason

        updated_at = payload.get("updated_at")
        try:
            if updated_at:
                updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                max_idle = timedelta(hours=max(1, settings.crawler_session_max_idle_hours))
                if _utc_now() - updated > max_idle:
                    return False, "session_stale"
        except Exception:
            return False, "invalid_updated_at"

        # if all cookies expire in the past, mark invalid
        has_valid_cookie = False
        now_ts = _utc_now().timestamp()
        for item in cookies:
            exp = item.get("expires")
            if exp is None or exp == -1:
                has_valid_cookie = True
                break
            try:
                if float(exp) > now_ts + 30:
                    has_valid_cookie = True
                    break
            except Exception:
                has_valid_cookie = True
                break
        if not has_valid_cookie:
            return False, "cookies_expired"

        failures = int(payload.get("consecutive_failures") or 0)
        if failures >= max(1, settings.crawler_session_fail_threshold):
            return False, "session_fail_threshold_reached"

        return True, ""

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
        now = _utc_now().isoformat()
        ok, reason = self.validate_cookie_bundle(platform, cookies)
        status = "active" if ok else "degraded"

        session_id = f"{platform}:{user_id}:{int(_utc_now().timestamp())}"
        payload = {
            "session_id": session_id,
            "platform": platform,
            "user_id": user_id,
            "status": status,
            "cookies": cookies,
            "user_agent": user_agent,
            "region": region,
            "source": source,
            "consecutive_failures": 0,
            "last_error": reason if not ok else "",
            "created_at": now,
            "updated_at": now,
            "last_success_at": now if ok else "",
            "last_failed_at": "",
        }
        key = self._key(platform, user_id)

        if await self._use_redis():
            await self._redis.set(key, self._serialize(payload))
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
            return self._deserialize(raw)
        return self._memory_sessions.get(key)

    async def get_valid_user_session(self, *, platform: str, user_id: str) -> Tuple[Optional[Dict[str, Any]], str]:
        payload = await self.get_user_session(platform=platform, user_id=user_id)
        if not payload:
            return None, "session_not_found"
        ok, reason = self.validate_session_payload(platform, payload)
        if not ok:
            if self._should_auto_evict(reason):
                await self.delete_user_session(platform=platform, user_id=user_id)
                return None, reason
            payload["status"] = "inactive"
            payload["last_error"] = reason
            payload["updated_at"] = _utc_now().isoformat()
            await self._save_payload(self._key(platform, user_id), payload)
            return None, reason
        return payload, ""

    async def touch_user_session(self, *, platform: str, user_id: str) -> None:
        payload = await self.get_user_session(platform=platform, user_id=user_id)
        if not payload:
            return
        payload["updated_at"] = _utc_now().isoformat()
        await self._save_payload(self._key(platform, user_id), payload)

    async def mark_session_result(self, *, platform: str, user_id: str, success: bool, error: str = "") -> None:
        payload = await self.get_user_session(platform=platform, user_id=user_id)
        if not payload:
            return
        now = _utc_now().isoformat()
        if success:
            payload["status"] = "active"
            payload["consecutive_failures"] = 0
            payload["last_success_at"] = now
            payload["last_error"] = ""
        else:
            failures = int(payload.get("consecutive_failures") or 0) + 1
            payload["consecutive_failures"] = failures
            payload["last_failed_at"] = now
            payload["last_error"] = (error or "crawl_failed")[:200]
            if failures >= max(1, settings.crawler_session_fail_threshold):
                payload["status"] = "degraded"
        payload["updated_at"] = now
        await self._save_payload(self._key(platform, user_id), payload)

    async def delete_user_session(self, *, platform: str, user_id: str) -> bool:
        key = self._key(platform, user_id)
        if await self._use_redis():
            deleted = await self._redis.delete(key)
            await self._redis.srem(self._index_key(user_id), key)
            return bool(deleted)
        return self._memory_sessions.pop(key, None) is not None

    @staticmethod
    def _sanitize(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "session_id": row.get("session_id", ""),
            "platform": row.get("platform", ""),
            "user_id": row.get("user_id", ""),
            "status": row.get("status", ""),
            "region": row.get("region", ""),
            "source": row.get("source", ""),
            "consecutive_failures": int(row.get("consecutive_failures") or 0),
            "last_error": row.get("last_error", ""),
            "created_at": row.get("created_at", ""),
            "updated_at": row.get("updated_at", ""),
            "last_success_at": row.get("last_success_at", ""),
            "last_failed_at": row.get("last_failed_at", ""),
        }

    async def list_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        if await self._use_redis():
            keys = await self._redis.smembers(self._index_key(user_id))
            rows: List[Dict[str, Any]] = []
            for key in keys:
                raw = await self._redis.get(key)
                if not raw:
                    continue
                parsed = self._deserialize(raw)
                if not parsed:
                    continue
                platform = str(parsed.get("platform") or "")
                if platform:
                    ok, reason = self.validate_session_payload(platform, parsed)
                    if not ok:
                        if self._should_auto_evict(reason):
                            await self._redis.delete(key)
                            await self._redis.srem(self._index_key(user_id), key)
                        continue
                rows.append(self._sanitize(parsed))
            return rows

        rows = []
        to_remove: List[str] = []
        for key, row in self._memory_sessions.items():
            if row.get("user_id") == user_id:
                platform = str(row.get("platform") or "")
                if platform:
                    ok, reason = self.validate_session_payload(platform, row)
                    if not ok:
                        if self._should_auto_evict(reason):
                            to_remove.append(key)
                        continue
                rows.append(self._sanitize(row))
        for key in to_remove:
            self._memory_sessions.pop(key, None)
        return rows


session_store = SessionStore()
