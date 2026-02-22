-- Phase 7: Idea Discovery (The Hunter) - idempotent migration
-- Compatible with previously-created hunter tables.

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- raw_market_signals
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.raw_market_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'comment',
  author_name TEXT,
  author_id TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  sentiment_score FLOAT,
  opportunity_score FLOAT,
  topic_tags JSONB DEFAULT '[]'::jsonb,
  pain_level TEXT,
  embedding vector(1536),
  language TEXT DEFAULT 'zh',
  region TEXT,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  content_hash TEXT UNIQUE
);

ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS author_id TEXT;
ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;
ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'zh';
ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.raw_market_signals ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_raw_signals_source ON public.raw_market_signals(source);
CREATE INDEX IF NOT EXISTS idx_raw_signals_opportunity ON public.raw_market_signals(opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_raw_signals_sentiment ON public.raw_market_signals(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_raw_signals_scanned ON public.raw_market_signals(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_signals_tags ON public.raw_market_signals USING GIN(topic_tags);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_market_signals'
      AND column_name = 'embedding'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_signals_embedding ON public.raw_market_signals USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  END IF;
END
$$;

-- =============================================================================
-- niche_opportunities
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.niche_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  signal_count INTEGER DEFAULT 0,
  sample_signals JSONB DEFAULT '[]'::jsonb,
  market_size_est TEXT,
  competition_level TEXT,
  urgency_score FLOAT,
  status TEXT DEFAULT 'new',
  assigned_to UUID REFERENCES auth.users(id),
  validation_id UUID REFERENCES public.validations(id),
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source_keywords TEXT[]
);

ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS signal_count INTEGER DEFAULT 0;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS sample_signals JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS market_size_est TEXT;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS competition_level TEXT;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS urgency_score FLOAT;
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS validation_id UUID REFERENCES public.validations(id);
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.niche_opportunities ADD COLUMN IF NOT EXISTS source_keywords TEXT[];

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.niche_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_urgency ON public.niche_opportunities(urgency_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON public.niche_opportunities(category);

-- =============================================================================
-- scan_jobs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords TEXT[] NOT NULL,
  platforms TEXT[] DEFAULT ARRAY['xiaohongshu'],
  frequency TEXT DEFAULT 'daily',
  status TEXT DEFAULT 'active',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  signals_found INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY['xiaohongshu'];
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'daily';
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS signals_found INTEGER DEFAULT 0;
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.raw_market_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niche_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of signals" ON public.raw_market_signals;
CREATE POLICY "Allow public read of signals"
ON public.raw_market_signals
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow service role insert" ON public.raw_market_signals;
CREATE POLICY "Allow service role insert"
ON public.raw_market_signals
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read of opportunities" ON public.niche_opportunities;
CREATE POLICY "Allow public read of opportunities"
ON public.niche_opportunities
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to update assigned opportunities" ON public.niche_opportunities;
CREATE POLICY "Allow users to update assigned opportunities"
ON public.niche_opportunities
FOR UPDATE USING (auth.uid() = assigned_to OR assigned_to IS NULL);

DROP POLICY IF EXISTS "Users can manage their own scan jobs" ON public.scan_jobs;
CREATE POLICY "Users can manage their own scan jobs"
ON public.scan_jobs
FOR ALL USING (auth.uid() = created_by);
