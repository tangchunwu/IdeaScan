-- Create crawler_jobs table
CREATE TABLE IF NOT EXISTS public.crawler_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  validation_id uuid,
  trace_id text,
  source text NOT NULL DEFAULT 'self_crawler',
  platforms text[] NOT NULL DEFAULT ARRAY['xiaohongshu'],
  query text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  request_payload jsonb DEFAULT '{}'::jsonb,
  result_payload jsonb DEFAULT '{}'::jsonb,
  quality_score numeric DEFAULT 0,
  cost_breakdown jsonb DEFAULT '{}'::jsonb,
  error text,
  external_job_id text,
  attempt integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create crawler_samples table
CREATE TABLE IF NOT EXISTS public.crawler_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.crawler_jobs(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'unknown',
  sample_type text NOT NULL DEFAULT 'note',
  content_hash text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  engagement numeric DEFAULT 0,
  published_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, content_hash)
);

-- Create crawler_provider_metrics_daily table
CREATE TABLE IF NOT EXISTS public.crawler_provider_metrics_daily (
  day date NOT NULL,
  provider text NOT NULL,
  total_jobs integer NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  avg_cost numeric NOT NULL DEFAULT 0,
  avg_quality numeric NOT NULL DEFAULT 0,
  p95_latency_ms integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_validation_id ON public.crawler_jobs(validation_id);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status ON public.crawler_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_created_at ON public.crawler_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawler_samples_job_id ON public.crawler_samples(job_id);
CREATE INDEX IF NOT EXISTS idx_crawler_samples_platform ON public.crawler_samples(platform);

-- updated_at trigger for crawler_jobs
CREATE OR REPLACE TRIGGER update_crawler_jobs_updated_at
  BEFORE UPDATE ON public.crawler_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.crawler_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawler_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawler_provider_metrics_daily ENABLE ROW LEVEL SECURITY;

-- RLS policies for crawler_jobs
CREATE POLICY "Service role full access on crawler_jobs"
  ON public.crawler_jobs FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own crawler jobs"
  ON public.crawler_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.validations v
    WHERE v.id = crawler_jobs.validation_id AND v.user_id = auth.uid()
  ));

-- RLS policies for crawler_samples
CREATE POLICY "Service role full access on crawler_samples"
  ON public.crawler_samples FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own crawler samples"
  ON public.crawler_samples FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.crawler_jobs cj
    JOIN public.validations v ON v.id = cj.validation_id
    WHERE cj.id = crawler_samples.job_id AND v.user_id = auth.uid()
  ));

-- RLS policies for crawler_provider_metrics_daily
CREATE POLICY "Anyone can view provider metrics"
  ON public.crawler_provider_metrics_daily FOR SELECT
  USING (true);

CREATE POLICY "Service role full access on provider metrics"
  ON public.crawler_provider_metrics_daily FOR ALL
  USING (true) WITH CHECK (true);