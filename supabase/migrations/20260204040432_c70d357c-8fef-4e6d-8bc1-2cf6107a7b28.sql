-- Fix overly permissive RLS policies that use USING (true) or WITH CHECK (true)
-- These policies should only allow service role access

-- 1. Fix niche_opportunities: "Service role can manage opportunities"
DROP POLICY IF EXISTS "Service role can manage opportunities" ON public.niche_opportunities;
CREATE POLICY "Service role can manage opportunities" ON public.niche_opportunities
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Fix raw_market_signals: "Service role can insert signals"
DROP POLICY IF EXISTS "Service role can insert signals" ON public.raw_market_signals;
CREATE POLICY "Service role can insert signals" ON public.raw_market_signals
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. Fix raw_market_signals: "Service role can update signals"
DROP POLICY IF EXISTS "Service role can update signals" ON public.raw_market_signals;
CREATE POLICY "Service role can update signals" ON public.raw_market_signals
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Fix sample_reports: "Service role can manage samples"
DROP POLICY IF EXISTS "Service role can manage samples" ON public.sample_reports;
CREATE POLICY "Service role can manage samples" ON public.sample_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Fix user_quotas: "Service role can manage quotas"
DROP POLICY IF EXISTS "Service role can manage quotas" ON public.user_quotas;
CREATE POLICY "Service role can manage quotas" ON public.user_quotas
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);