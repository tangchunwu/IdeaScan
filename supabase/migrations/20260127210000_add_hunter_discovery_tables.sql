-- Phase 7: Idea Discovery (The Hunter)
-- Data Infrastructure: raw_market_signals + niche_opportunities

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Table: raw_market_signals
-- Purpose: Store all crawled comments, posts, complaints from various platforms
-- =============================================================================
CREATE TABLE IF NOT EXISTS raw_market_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source metadata
    source TEXT NOT NULL, -- 'xiaohongshu', 'reddit', 'twitter', 'douyin'
    source_id TEXT, -- Original post/comment ID from the platform
    source_url TEXT, -- Link to original content
    
    -- Content
    content TEXT NOT NULL, -- The actual comment/post text
    content_type TEXT DEFAULT 'comment', -- 'post', 'comment', 'reply'
    author_name TEXT,
    author_id TEXT,
    
    -- Engagement metrics (for prioritization)
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    
    -- AI-computed fields
    sentiment_score FLOAT, -- -1 (very negative/painful) to +1 (positive)
    opportunity_score FLOAT, -- 0-100, higher = more promising opportunity
    topic_tags JSONB DEFAULT '[]'::jsonb, -- ["saas", "payment", "complaint"]
    pain_level TEXT, -- 'mild', 'moderate', 'severe', 'critical'
    
    -- Semantic search vector (1536 dimensions for OpenAI embeddings)
    embedding vector(1536),
    
    -- Metadata
    language TEXT DEFAULT 'zh',
    region TEXT, -- 'cn', 'us', 'global'
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ, -- When AI analysis was completed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication
    content_hash TEXT UNIQUE -- MD5 hash of content to prevent duplicates
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_raw_signals_source ON raw_market_signals(source);
CREATE INDEX IF NOT EXISTS idx_raw_signals_opportunity ON raw_market_signals(opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_raw_signals_sentiment ON raw_market_signals(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_raw_signals_scanned ON raw_market_signals(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_signals_tags ON raw_market_signals USING GIN(topic_tags);

-- Vector similarity search index (HNSW for fast approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_raw_signals_embedding ON raw_market_signals 
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Table: niche_opportunities
-- Purpose: Aggregated opportunities discovered from raw signals
-- =============================================================================
CREATE TABLE IF NOT EXISTS niche_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Opportunity summary
    title TEXT NOT NULL, -- "小红书博主急需批量修图工具"
    description TEXT, -- Detailed explanation
    category TEXT, -- 'saas', 'mobile_app', 'physical_product', 'service'
    
    -- Evidence chain
    signal_count INTEGER DEFAULT 0, -- How many raw_market_signals support this
    sample_signals JSONB DEFAULT '[]'::jsonb, -- Array of signal IDs/snippets
    
    -- Market assessment
    market_size_est TEXT, -- "$1M", "$10M", "$100M+"
    competition_level TEXT, -- 'none', 'low', 'medium', 'high', 'saturated'
    urgency_score FLOAT, -- 0-100, how urgent is the need
    
    -- Status workflow
    status TEXT DEFAULT 'new', -- 'new', 'reviewing', 'validated', 'building', 'ignored'
    assigned_to UUID REFERENCES auth.users(id),
    
    -- Linking to validation
    validation_id UUID REFERENCES validations(id), -- If user decides to validate this
    
    -- Timestamps
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Source keywords that led to this discovery
    source_keywords TEXT[]
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON niche_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_urgency ON niche_opportunities(urgency_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON niche_opportunities(category);

-- =============================================================================
-- Table: scan_jobs
-- Purpose: Track scheduled crawl jobs
-- =============================================================================
CREATE TABLE IF NOT EXISTS scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job configuration
    keywords TEXT[] NOT NULL, -- Keywords to scan for
    platforms TEXT[] DEFAULT ARRAY['xiaohongshu'], -- Platforms to scan
    frequency TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'
    
    -- Status
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    signals_found INTEGER DEFAULT 0, -- Total signals found by this job
    
    -- Owner
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- raw_market_signals: Public read for discovery, insert via Edge Function
ALTER TABLE raw_market_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of signals" ON raw_market_signals
    FOR SELECT USING (true);

CREATE POLICY "Allow service role insert" ON raw_market_signals
    FOR INSERT WITH CHECK (true); -- Edge functions use service role

-- niche_opportunities: Users can see all, but only modify their assigned ones
ALTER TABLE niche_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of opportunities" ON niche_opportunities
    FOR SELECT USING (true);

CREATE POLICY "Allow users to update assigned opportunities" ON niche_opportunities
    FOR UPDATE USING (auth.uid() = assigned_to OR assigned_to IS NULL);

-- scan_jobs: Users can only see/modify their own jobs
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scan jobs" ON scan_jobs
    FOR ALL USING (auth.uid() = created_by);
