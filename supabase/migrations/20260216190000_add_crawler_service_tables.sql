-- =====================================================
-- Crawler service integration tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.crawler_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'self_crawler',
  platforms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0,
  external_job_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_score NUMERIC(8, 3),
  cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crawler_jobs_validation_created
ON public.crawler_jobs(validation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status_created
ON public.crawler_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawler_jobs_trace
ON public.crawler_jobs(trace_id);

DROP TRIGGER IF EXISTS update_crawler_jobs_updated_at ON public.crawler_jobs;
CREATE TRIGGER update_crawler_jobs_updated_at
BEFORE UPDATE ON public.crawler_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crawler_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crawler jobs"
ON public.crawler_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.validations v
    WHERE v.id = validation_id
      AND v.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage crawler jobs"
ON public.crawler_jobs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.crawler_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.crawler_jobs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('note', 'comment')),
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  engagement INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_crawler_samples_job_type
ON public.crawler_samples(job_id, sample_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawler_samples_platform
ON public.crawler_samples(platform, created_at DESC);

ALTER TABLE public.crawler_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crawler samples"
ON public.crawler_samples FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.crawler_jobs j
    JOIN public.validations v ON v.id = j.validation_id
    WHERE j.id = job_id
      AND v.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage crawler samples"
ON public.crawler_samples FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.crawler_provider_metrics_daily (
  day DATE NOT NULL,
  provider TEXT NOT NULL,
  success_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  p95_latency_ms INTEGER NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  avg_quality NUMERIC(8, 3) NOT NULL DEFAULT 0,
  total_jobs INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, provider)
);

ALTER TABLE public.crawler_provider_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crawler metrics read for authenticated users"
ON public.crawler_provider_metrics_daily FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage crawler metrics"
ON public.crawler_provider_metrics_daily FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
