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
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user_validation' 
CHECK (source_type IN ('user_validation', 'scheduled_scan', 'manual'));

-- Add confidence level based on data quality
ALTER TABLE public.trending_topics 
ADD COLUMN IF NOT EXISTS confidence_level TEXT DEFAULT 'low' 
CHECK (confidence_level IN ('high', 'medium', 'low'));

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

-- Add RLS policy for service role to update any topic
CREATE POLICY "Service role can update all topics"
ON public.trending_topics
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Comment for documentation
COMMENT ON COLUMN public.trending_topics.validation_count IS '该话题被用户验证的次数';
COMMENT ON COLUMN public.trending_topics.avg_validation_score IS '所有验证的平均 AI 评分 (0-100)';
COMMENT ON COLUMN public.trending_topics.source_type IS '话题来源: user_validation(用户验证), scheduled_scan(定时扫描), manual(手动添加)';
COMMENT ON COLUMN public.trending_topics.confidence_level IS '置信度等级: high(>=3次验证), medium(1-2次验证), low(仅扫描)';
COMMENT ON COLUMN public.trending_topics.quality_score IS '综合质量分 = 热度(40%) + 验证分(30%) + 次数(20%) + 新鲜度(10%)';
