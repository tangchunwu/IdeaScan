from __future__ import annotations

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException

from app.config import settings
from app.models import EnqueueJobRequest
from app.processor import process_job
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

