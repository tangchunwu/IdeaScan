from __future__ import annotations

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query

from app.auth_manager import auth_manager
from app.config import settings
from app.models import EnqueueJobRequest, ImportCookiesRequest, StartAuthSessionRequest
from app.processor import process_job
from app.session_store import session_store
from app.store import job_store

app = FastAPI(title="IdeaScan Crawler Service", version="0.1.0")


def verify_token(authorization: str | None = Header(default=None)) -> None:
    if not settings.crawler_api_token:
        return
    expected = f"Bearer {settings.crawler_api_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/v1/crawl/jobs", dependencies=[Depends(verify_token)])
async def enqueue_job(req: EnqueueJobRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    payload = req.model_dump()
    await job_store.enqueue(payload)
    if settings.crawler_inline_mode:
        background_tasks.add_task(process_job, payload)
    return {"job_id": req.job_id, "status": "queued"}


@app.get("/internal/v1/crawl/jobs/{job_id}", dependencies=[Depends(verify_token)])
async def get_job(job_id: str) -> dict:
    return await job_store.get_status(job_id)


@app.post("/internal/v1/crawl/cancel/{job_id}", dependencies=[Depends(verify_token)])
async def cancel_job(job_id: str) -> dict[str, str]:
    await job_store.set_status(job_id, "cancelled")
    return {"job_id": job_id, "status": "cancelled"}


@app.post("/internal/v1/auth/sessions/start", dependencies=[Depends(verify_token)])
async def start_auth_session(req: StartAuthSessionRequest) -> dict:
    return await auth_manager.start_flow(
        platform=req.platform,
        user_id=req.user_id,
        region=req.region,
    )


@app.get("/internal/v1/auth/sessions/{flow_id}", dependencies=[Depends(verify_token)])
async def get_auth_session_status(
    flow_id: str,
    manual_confirm: bool = Query(default=False),
) -> dict:
    return await auth_manager.get_status(flow_id, manual_confirm=manual_confirm)


@app.post("/internal/v1/auth/sessions/cancel/{flow_id}", dependencies=[Depends(verify_token)])
async def cancel_auth_session(flow_id: str) -> dict:
    return await auth_manager.cancel_flow(flow_id)


@app.post("/internal/v1/auth/sessions/import", dependencies=[Depends(verify_token)])
async def import_auth_cookies(req: ImportCookiesRequest) -> dict:
    return await auth_manager.import_cookies(
        platform=req.platform,
        user_id=req.user_id,
        cookies=req.cookies,
        region=req.region,
    )


@app.get("/internal/v1/auth/sessions/user/{user_id}", dependencies=[Depends(verify_token)])
async def list_user_sessions(user_id: str) -> dict:
    rows = await session_store.list_user_sessions(user_id)
    return {"user_id": user_id, "sessions": rows}


@app.post("/internal/v1/auth/sessions/revoke", dependencies=[Depends(verify_token)])
async def revoke_user_session(body: dict) -> dict:
    user_id = str(body.get("user_id") or "").strip()
    platform = str(body.get("platform") or "").strip()
    if not user_id or not platform:
        raise HTTPException(status_code=400, detail="user_id and platform are required")
    deleted = await session_store.delete_user_session(platform=platform, user_id=user_id)
    return {"success": bool(deleted), "user_id": user_id, "platform": platform}
