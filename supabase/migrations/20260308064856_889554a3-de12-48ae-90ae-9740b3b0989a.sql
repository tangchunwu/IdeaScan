-- Fix #3: Restrict trending_topics to authenticated users only
DROP POLICY IF EXISTS "Anyone can view active trending topics" ON public.trending_topics;
CREATE POLICY "Authenticated users can view active trending topics"
  ON public.trending_topics
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Fix #4: Remove public SELECT from crawler_provider_metrics_daily
DROP POLICY IF EXISTS "Anyone can view provider metrics" ON public.crawler_provider_metrics_daily;