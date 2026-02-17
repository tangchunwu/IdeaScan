from __future__ import annotations

import asyncio
import logging

from app.processor import process_job
from app.store import job_store

logger = logging.getLogger("crawler-worker")


async def run_worker() -> None:
    logger.info("Crawler worker started")
    while True:
        message = await job_store.pop(timeout=3)
        if not message:
            await asyncio.sleep(0.2)
            continue
        try:
            await process_job(message)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Job processing failed: %s", exc)

