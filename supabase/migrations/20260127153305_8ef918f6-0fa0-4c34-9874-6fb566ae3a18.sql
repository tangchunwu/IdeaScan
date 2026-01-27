-- Phase 7: Hunter Discovery Tables
-- 1. scan_jobs: User-defined monitoring tasks
CREATE TABLE public.scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keywords TEXT[] NOT NULL,
    platforms TEXT[] NOT NULL DEFAULT ARRAY['xiaohongshu', 'reddit'],
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('hourly', 'daily', 'weekly')),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    signals_found INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. raw_market_signals: Crawled content from social platforms
CREATE TABLE public.raw_market_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    source_id TEXT,
    source_url TEXT,
    content_type TEXT NOT NULL DEFAULT 'post',
    author_name TEXT,
    likes_count INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT UNIQUE,
    sentiment_score NUMERIC(3,2),
    opportunity_score INTEGER CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
    topic_tags TEXT[],
    pain_level TEXT CHECK (pain_level IN ('mild', 'moderate', 'severe', 'critical')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- 3. niche_opportunities: Aggregated business opportunities from AI analysis
CREATE TABLE public.niche_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    urgency_score INTEGER NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
    signal_count INTEGER NOT NULL DEFAULT 0,
    avg_opportunity_score INTEGER DEFAULT 0,
    top_sources TEXT[],
    market_size_est TEXT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_market_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niche_opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scan_jobs (user-owned)
CREATE POLICY "Users can view their own scan jobs"
ON public.scan_jobs FOR SELECT
USING (created_by = auth.uid());

CREATE POLICY "Users can create their own scan jobs"
ON public.scan_jobs FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own scan jobs"
ON public.scan_jobs FOR UPDATE
USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own scan jobs"
ON public.scan_jobs FOR DELETE
USING (created_by = auth.uid());

-- RLS Policies for raw_market_signals (public read, system write)
CREATE POLICY "Anyone can view market signals"
ON public.raw_market_signals FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can insert signals"
ON public.raw_market_signals FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update signals"
ON public.raw_market_signals FOR UPDATE
TO service_role
USING (true);

-- RLS Policies for niche_opportunities (public read)
CREATE POLICY "Anyone can view opportunities"
ON public.niche_opportunities FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage opportunities"
ON public.niche_opportunities FOR ALL
TO service_role
USING (true);

-- Indexes for performance
CREATE INDEX idx_scan_jobs_created_by ON public.scan_jobs(created_by);
CREATE INDEX idx_scan_jobs_status ON public.scan_jobs(status);
CREATE INDEX idx_raw_market_signals_opportunity_score ON public.raw_market_signals(opportunity_score DESC);
CREATE INDEX idx_raw_market_signals_scanned_at ON public.raw_market_signals(scanned_at DESC);
CREATE INDEX idx_raw_market_signals_processed_at ON public.raw_market_signals(processed_at);
CREATE INDEX idx_niche_opportunities_urgency ON public.niche_opportunities(urgency_score DESC);

-- Trigger for updated_at
CREATE TRIGGER update_scan_jobs_updated_at
    BEFORE UPDATE ON public.scan_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_niche_opportunities_updated_at
    BEFORE UPDATE ON public.niche_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();