from __future__ import annotations

import json
from typing import Any, Dict

import httpx

from app.adapters import DouyinAdapter, XiaohongshuAdapter
from app.config import settings
from app.models import CrawlerJobPayload, CrawlerResultPayload, CrawlerResultCost, CrawlerResultQuality
from app.normalizer import calc_dup_ratio, calc_freshness_score
from app.risk_control import RiskController
from app.security import hmac_sha256_hex
from app.store import job_store


risk_controller = RiskController(
    session_pool_size=settings.crawler_session_pool_size,
    user_agent_pool=settings.crawler_user_agent_pool,
)


def _build_adapters() -> Dict[str, Any]:
    return {
        "xiaohongshu": XiaohongshuAdapter(risk_controller),
        "douyin": DouyinAdapter(risk_controller),
    }


async def _send_callback(callback_url: str, callback_secret: str, payload: CrawlerResultPayload) -> None:
    body = payload.model_dump_json(ensure_ascii=False)
    signature = hmac_sha256_hex(callback_secret, body)
    timeout = httpx.Timeout(settings.crawler_callback_timeout_s)
    async with httpx.AsyncClient(timeout=timeout) as client:
        await client.post(
            callback_url,
            content=body.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Crawler-Signature": signature,
            },
        )


async def process_job(message: Dict[str, Any]) -> CrawlerResultPayload:
    job_id = str(message["job_id"])
    callback_url = str(message["callback_url"])
    callback_secret = str(message.get("callback_secret", ""))
    payload = CrawlerJobPayload.model_validate(message["payload"])

    await job_store.set_status(job_id, "running")
    adapters = _build_adapters()
    platform_results = []
    errors: list[str] = []
    external_calls = 0
    proxy_calls = 0
    est_cost = 0.0
    provider_mix: dict[str, float] = {}

    for platform in payload.platforms:
        adapter = adapters.get(platform)
        if adapter is None:
            errors.append(f"unsupported_platform:{platform}")
            continue
        try:
            result, cost = await adapter.crawl(payload)
            platform_results.append(result)
            external_calls += int(cost.get("external_api_calls", 0))
            proxy_calls += int(cost.get("proxy_calls", 0))
            est_cost += float(cost.get("est_cost", 0.0))
            mix = cost.get("provider_mix", {})
            if isinstance(mix, dict):
                for k, v in mix.items():
                    provider_mix[str(k)] = provider_mix.get(str(k), 0.0) + float(v)
            if not result.success and result.error:
                errors.append(f"{platform}:{result.error}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{platform}:{exc}")

    quality = CrawlerResultQuality(
        sample_count=sum(len(item.notes) + len(item.comments) for item in platform_results),
        comment_count=sum(len(item.comments) for item in platform_results),
        freshness_score=calc_freshness_score(platform_results),
        dup_ratio=calc_dup_ratio(platform_results),
    )

    status = "completed" if platform_results else "failed"
    result_payload = CrawlerResultPayload(
        job_id=job_id,
        status=status,  # type: ignore[arg-type]
        platform_results=platform_results,
        quality=quality,
        cost=CrawlerResultCost(
            external_api_calls=external_calls,
            proxy_calls=proxy_calls,
            est_cost=round(est_cost, 6),
            provider_mix=provider_mix,
        ),
        errors=errors,
    )

    await job_store.set_status(job_id, status, {"result": result_payload.model_dump()})

    try:
        await _send_callback(callback_url, callback_secret, result_payload)
    except Exception as exc:  # noqa: BLE001
        await job_store.set_status(job_id, status, {"callback_error": str(exc)[:500]})

    return result_payload

