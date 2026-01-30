-- Add validation tracking fields to trending_topics
-- This allows the hot topic library to accumulate quality data from user validations

-- Add validation count field
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS validation_count INTEGER DEFAULT 0;

-- Add average validation score field (AI-generated overall score)
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS avg_validation_score DECIMAL(5,2);

-- Add source type to track where the topic came from
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user_validation';

-- Add confidence level based on data quality
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS confidence_level TEXT DEFAULT 'low';

-- Add last crawled timestamp
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMP WITH TIME ZONE;

-- Add combined quality score (heat + validation weighted)
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;

-- Create index for quality-based sorting
CREATE INDEX IF NOT EXISTS idx_trending_topics_quality 
ON public.trending_topics(quality_score DESC) 
WHERE is_active = true;

-- Create index for validation count
CREATE INDEX IF NOT EXISTS idx_trending_topics_validation_count 
ON public.trending_topics(validation_count DESC) 
WHERE is_active = true AND validation_count > 0;