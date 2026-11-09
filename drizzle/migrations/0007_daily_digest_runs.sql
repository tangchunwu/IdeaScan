-- 每日情报日报发送记录，用于幂等和失败重试。
CREATE TABLE IF NOT EXISTS public.daily_digest_runs (
  digest_date DATE PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'sent', 'failed')),
  signal_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB,
  provider_message_id TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.daily_digest_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.daily_digest_runs IS 'IdeaScan 每日市场信号聚合日报发送记录；仅 service role 写入。';

-- 生产环境请在 Supabase Secrets 中配置：
-- RESEND_API_KEY、DAILY_DIGEST_TO_EMAIL、DIGEST_FROM_EMAIL、DAILY_DIGEST_CRON_SECRET。
-- 函数使用 x-digest-secret 鉴权，避免将 service role key 放进定时任务请求体。