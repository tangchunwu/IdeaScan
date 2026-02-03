-- 添加缓存相关字段到 trending_topics
ALTER TABLE public.trending_topics
ADD COLUMN IF NOT EXISTS cached_social_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cached_competitor_data JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
ADD COLUMN IF NOT EXISTS cache_hit_count INTEGER DEFAULT 0;

-- 创建缓存查询函数
CREATE OR REPLACE FUNCTION public.get_cached_topic_data(p_keyword TEXT)
RETURNS TABLE(
  topic_id UUID,
  cached_social_data JSONB,
  cached_competitor_data JSONB,
  is_valid BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS topic_id,
    t.cached_social_data,
    t.cached_competitor_data,
    (t.cache_expires_at > now()) AS is_valid
  FROM public.trending_topics t
  WHERE 
    t.keyword ILIKE '%' || p_keyword || '%'
    AND t.is_active = true
    AND t.cached_social_data IS NOT NULL
    AND t.cached_social_data != '{}'::jsonb
  ORDER BY t.heat_score DESC
  LIMIT 1;
END;
$$;

-- 更新缓存命中计数函数
CREATE OR REPLACE FUNCTION public.increment_cache_hit(p_topic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trending_topics
  SET cache_hit_count = COALESCE(cache_hit_count, 0) + 1,
      updated_at = now()
  WHERE id = p_topic_id;
END;
$$;

-- 添加索引优化缓存查询
CREATE INDEX IF NOT EXISTS idx_trending_topics_cache_lookup 
ON public.trending_topics (keyword, is_active, heat_score DESC) 
WHERE is_active = true;