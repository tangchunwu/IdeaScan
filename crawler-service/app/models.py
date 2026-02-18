from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


CrawlMode = Literal["quick", "deep"]
CrawlPlatform = Literal["xiaohongshu", "douyin"]
CrawlStatus = Literal["queued", "dispatched", "running", "completed", "failed", "cancelled"]


class CrawlerJobLimits(BaseModel):
    notes: int = 6
    comments_per_note: int = 3


class CrawlerJobPayload(BaseModel):
    validation_id: str
    trace_id: str
    user_id: Optional[str] = None
    query: str
    platforms: List[CrawlPlatform]
    mode: CrawlMode = "quick"
    limits: CrawlerJobLimits = Field(default_factory=CrawlerJobLimits)
    freshness_days: int = 14
    timeout_ms: int = 12000


class EnqueueJobRequest(BaseModel):
    job_id: str
    callback_url: str
    callback_secret: str
    payload: CrawlerJobPayload


class CrawlerNormalizedNote(BaseModel):
    id: str
    title: str
    desc: str
    liked_count: int = 0
    comments_count: int = 0
    collected_count: int = 0
    published_at: Optional[str] = None
    platform: str
    url: Optional[str] = None


class CrawlerNormalizedComment(BaseModel):
    id: str
    content: str
    like_count: int = 0
    user_nickname: str = ""
    ip_location: str = ""
    published_at: Optional[str] = None
    platform: str
    parent_id: Optional[str] = None


class CrawlerPlatformResult(BaseModel):
    platform: str
    notes: List[CrawlerNormalizedNote] = Field(default_factory=list)
    comments: List[CrawlerNormalizedComment] = Field(default_factory=list)
    success: bool = True
    latency_ms: int = 0
    error: Optional[str] = None


class CrawlerResultQuality(BaseModel):
    sample_count: int = 0
    comment_count: int = 0
    freshness_score: float = 0
    dup_ratio: float = 0


class CrawlerResultCost(BaseModel):
    external_api_calls: int = 0
    proxy_calls: int = 0
    est_cost: float = 0
    provider_mix: Dict[str, float] = Field(default_factory=dict)


class CrawlerResultPayload(BaseModel):
    job_id: str
    status: Literal["completed", "failed", "cancelled"]
    platform_results: List[CrawlerPlatformResult] = Field(default_factory=list)
    quality: CrawlerResultQuality = Field(default_factory=CrawlerResultQuality)
    cost: CrawlerResultCost = Field(default_factory=CrawlerResultCost)
    errors: List[str] = Field(default_factory=list)


class StartAuthSessionRequest(BaseModel):
    platform: CrawlPlatform
    user_id: str
    region: str = ""


class StartAuthSessionResponse(BaseModel):
    flow_id: str
    platform: CrawlPlatform
    status: Literal["pending", "failed"]
    qr_image_base64: str = ""
    expires_in: int = 0
    error: Optional[str] = None


class AuthSessionStatusResponse(BaseModel):
    flow_id: str
    platform: CrawlPlatform
    user_id: str
    status: Literal["pending", "authorized", "expired", "cancelled", "failed"]
    message: Optional[str] = None
    auth_metrics: Optional[Dict[str, Any]] = None
    session_saved: bool = False
    error: Optional[str] = None


class ImportCookiesRequest(BaseModel):
    platform: CrawlPlatform
    user_id: str
    cookies: List[Dict[str, Any]]
    region: str = ""
