CREATE OR REPLACE FUNCTION public.get_public_trending_topics(p_limit integer DEFAULT 5)
RETURNS TABLE(
  id uuid,
  keyword text,
  category text,
  heat_score integer,
  growth_rate numeric,
  sample_count integer,
  quality_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.keyword,
    t.category,
    t.heat_score,
    t.growth_rate,
    t.sample_count,
    t.quality_score
  FROM public.trending_topics t
  WHERE t.is_active = true
  ORDER BY t.quality_score DESC NULLS LAST
  LIMIT p_limit;
END;
$$;