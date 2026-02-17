from __future__ import annotations

import asyncio
import logging


logger = logging.getLogger("crawler-scheduler")


async def run_scheduler() -> None:
    logger.info("Scheduler started (placeholder).")
    while True:
        # Reserved for periodic refresh/retry strategies.
        await asyncio.sleep(30)

