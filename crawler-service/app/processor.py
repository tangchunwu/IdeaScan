from __future__ import annotations

import asyncio
import json
from typing import Any, Dict

import httpx

from app.adapters import DouyinAdapter, XiaohongshuAdapter
from app.config import settings
from app.models import CrawlerJobPayload, CrawlerResultPayload, CrawlerResultCost, CrawlerResultQuality, CrawlerPlatformResult
from app.normalizer import calc_dup_ratio, calc_freshness_score
from app.risk_control import RiskController
from app.security import hmac_sha256_hex
from app.store import budget_store, job_store


risk_controller = RiskController(
    session_pool_size=settings.crawler_session_pool_size,
    user_agent_pool=settings.crawler_user_agent_pool,
)


def _build_adapters() -> Dict[str, Any]:
    return {
        "xiaohongshu": XiaohongshuAdapter(risk_controller),
        "douyin": DouyinAdapter(risk_controller),
    }


def _estimate_budget_units(payload: CrawlerJobPayload) -> int:
    # Estimate crawl cost by fan-out scale; deep mode costs more.
    per_platform = payload.limits.notes + payload.limits.notes * min(payload.limits.comments_per_note, 12)
    mode_multiplier = 1 if payload.mode == "quick" else 2
    return max(8, per_platform * mode_multiplier)


async def _send_callback(callback_url: str, callback_secret: str, payload: CrawlerResultPayload) -> None:
    # pydantic v2 model_dump_json does not accept ensure_ascii
    body = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False)
    signature = hmac_sha256_hex(callback_secret, body)
    timeout = httpx.Timeout(settings.crawler_callback_timeout_s)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            callback_url,
            content=body.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Crawler-Signature": signature,
            },
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(
                f"callback_http_{response.status_code}:{response.text[:240]}"
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
    diagnostic: Dict[str, Any] = {
        "proxy_binding_id": "",
        "proxy_rotated": False,
        "self_retry_count": 0,
        "fallback_used": False,
        "fallback_reason": "",
    }

    for platform in payload.platforms:
        adapter = adapters.get(platform)
        if adapter is None:
            errors.append(f"unsupported_platform:{platform}")
            continue
        if settings.crawler_enable_daily_budget and payload.user_id:
            budget = await budget_store.consume(
                user_id=str(payload.user_id),
                units=_estimate_budget_units(payload),
                total_budget=settings.crawler_daily_budget_units,
            )
            if not bool(budget.get("allowed")):
                budget_error = (
                    f"daily_budget_exceeded:"
                    f"used={budget.get('used')},remaining={budget.get('remaining')},total={budget.get('total')}"
                )
                errors.append(f"{platform}:{budget_error}")
                platform_results.append(
                    CrawlerPlatformResult(
                        platform=platform,
                        notes=[],
                        comments=[],
                        success=False,
                        latency_ms=0,
                        error=budget_error,
                    )
                )
                continue
        try:
            crawl_timeout_s = max(5.0, float(payload.timeout_ms) / 1000.0)
            result, cost = await asyncio.wait_for(adapter.crawl(payload), timeout=crawl_timeout_s)
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
            if isinstance(getattr(result, "diagnostic", None), dict):
                pd = result.diagnostic
                if pd.get("proxy_binding_id"):
                    diagnostic["proxy_binding_id"] = str(pd.get("proxy_binding_id"))
                if bool(pd.get("proxy_rotated")):
                    diagnostic["proxy_rotated"] = True
                if bool(pd.get("fallback_used")):
                    diagnostic["fallback_used"] = True
                if pd.get("fallback_reason"):
                    diagnostic["fallback_reason"] = str(pd.get("fallback_reason"))
                if isinstance(pd.get("self_retry_count"), (int, float)):
                    diagnostic["self_retry_count"] = int(pd.get("self_retry_count") or 0)
        except TimeoutError:
            timeout_error = f"crawl_timeout_{int(crawl_timeout_s * 1000)}ms"
            errors.append(f"{platform}:{timeout_error}")
            platform_results.append(
                CrawlerPlatformResult(
                    platform=platform,
                    notes=[],
                    comments=[],
                    success=False,
                    latency_ms=int(crawl_timeout_s * 1000),
                    error=timeout_error,
                )
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{platform}:{exc}")

    quality = CrawlerResultQuality(
        sample_count=sum(len(item.notes) + len(item.comments) for item in platform_results),
        comment_count=sum(len(item.comments) for item in platform_results),
        freshness_score=calc_freshness_score(platform_results),
        dup_ratio=calc_dup_ratio(platform_results),
    )

    status = "completed" if any(item.success for item in platform_results) else "failed"
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
        diagnostic=diagnostic,
    )

    await job_store.set_status(job_id, status, {"result": result_payload.model_dump()})

    try:
        await _send_callback(callback_url, callback_secret, result_payload)
    except Exception as exc:  # noqa: BLE001
        await job_store.set_status(job_id, status, {"callback_error": str(exc)[:500]})

    return result_payload
