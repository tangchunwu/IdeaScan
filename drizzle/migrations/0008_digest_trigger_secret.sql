-- 日报表仅由后端读写，普通用户不可访问。
GRANT ALL ON public.daily_digest_runs TO service_role;

-- 定时任务回调令牌：值由数据库生成，不进入 SQL 文本、不写入环境变量，仅 service role 可读。
CREATE TABLE IF NOT EXISTS public.digest_trigger_secrets (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.digest_trigger_secrets TO service_role;

ALTER TABLE public.digest_trigger_secrets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.digest_trigger_secrets IS '每日日报触发令牌：无 RLS 策略，仅 service role 可读；定时任务从本表取值回调 daily-digest。';

INSERT INTO public.digest_trigger_secrets (id, secret)
SELECT 1, encode(gen_random_bytes(24), 'hex')
ON CONFLICT (id) DO NOTHING;