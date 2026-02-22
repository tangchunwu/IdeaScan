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
    crawler_auth_flow_ttl_s: int = 300
    crawler_enable_daily_budget: bool = False
    crawler_daily_budget_units: int = 6000
    crawler_session_encryption_key: str = ""
    crawler_session_max_idle_hours: int = 168
    crawler_session_fail_threshold: int = 3
    crawler_user_agent_pool: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7),"
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64),"
        "Mozilla/5.0 (X11; Linux x86_64)"
    )
    crawler_quick_delay_ms_min: int = 4000
    crawler_quick_delay_ms_max: int = 7000
    crawler_deep_delay_ms_min: int = 4000
    crawler_deep_delay_ms_max: int = 7000
    crawler_playwright_headless: bool = False  # 调试期依然打开浏览器方便观察
    crawler_playwright_mode: str = "launch"  # launch | cdp
    crawler_playwright_cdp_url: str = ""
    crawler_playwright_cdp_fallback_launch: bool = True
    crawler_proxy_mode: str = "sticky_user"  # off | global | sticky_user
    crawler_proxy_sticky_ttl_s: int = 1800
    crawler_proxy_rotate_on_fails: int = 2
    crawler_proxy_scheme: str = "socks5"
    crawler_proxy_socks5h: bool = True
    crawler_default_proxy_server: str = ""
    crawler_default_proxy_username: str = ""
    crawler_default_proxy_password: str = ""
    crawler_xhs_quick_max_notes: int = 10
    crawler_xhs_quick_max_comments_per_note: int = 10
    crawler_xhs_deep_max_notes: int = 10
    crawler_xhs_deep_max_comments_per_note: int = 10
    crawler_xhs_quick_session_cooldown_s: int = 20
    crawler_xhs_deep_session_cooldown_s: int = 45
    crawler_xhs_quick_comment_pages: int = 2
    crawler_xhs_deep_comment_pages: int = 4
    crawler_xhs_quick_min_notes_return: int = 10
    crawler_xhs_quick_min_comments_return: int = 50
    crawler_xhs_deep_min_notes_return: int = 10
    crawler_xhs_deep_min_comments_return: int = 50

    tikhub_token: str = ""


settings = Settings()
