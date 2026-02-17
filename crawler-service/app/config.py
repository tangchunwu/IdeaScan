from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    crawler_api_token: str = ""
    crawler_redis_url: str = "redis://localhost:6379/0"
    crawler_job_queue_key: str = "crawler:jobs"
    crawler_inline_mode: bool = False
    crawler_http_timeout_s: int = 12
    crawler_callback_timeout_s: int = 8
    crawler_session_pool_size: int = 8
    crawler_retry_times: int = 2
    crawler_auth_flow_ttl_s: int = 180
    crawler_enable_daily_budget: bool = True
    crawler_daily_budget_units: int = 1200
    crawler_session_encryption_key: str = ""
    crawler_session_max_idle_hours: int = 168
    crawler_session_fail_threshold: int = 3
    crawler_user_agent_pool: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7),"
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64),"
        "Mozilla/5.0 (X11; Linux x86_64)"
    )
    crawler_quick_delay_ms_min: int = 900
    crawler_quick_delay_ms_max: int = 1800
    crawler_deep_delay_ms_min: int = 600
    crawler_deep_delay_ms_max: int = 1200
    crawler_playwright_headless: bool = True
    crawler_default_proxy_server: str = ""
    crawler_default_proxy_username: str = ""
    crawler_default_proxy_password: str = ""

    tikhub_token: str = ""


settings = Settings()
