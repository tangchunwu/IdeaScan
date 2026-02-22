
-- Fix overly permissive "always true" RLS policies by scoping to service_role

-- 1. user_quotas
DROP POLICY IF EXISTS "Service role can manage quotas" ON public.user_quotas;
CREATE POLICY "Service role can manage quotas" ON public.user_quotas
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 2. niche_opportunities
DROP POLICY IF EXISTS "Service role can manage opportunities" ON public.niche_opportunities;
CREATE POLICY "Service role can manage opportunities" ON public.niche_opportunities
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 3. idea_proof_snapshots
DROP POLICY IF EXISTS "Service role full access on snapshots" ON public.idea_proof_snapshots;
CREATE POLICY "Service role full access on snapshots" ON public.idea_proof_snapshots
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 4. crawler_provider_metrics_daily
DROP POLICY IF EXISTS "Service role full access on provider metrics" ON public.crawler_provider_metrics_daily;
CREATE POLICY "Service role full access on provider metrics" ON public.crawler_provider_metrics_daily
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 5. experiment_events
DROP POLICY IF EXISTS "Service role full access on events" ON public.experiment_events;
CREATE POLICY "Service role full access on events" ON public.experiment_events
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 6. demand_experiments
DROP POLICY IF EXISTS "Service role full access on experiments" ON public.demand_experiments;
CREATE POLICY "Service role full access on experiments" ON public.demand_experiments
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 7. crawler_jobs
DROP POLICY IF EXISTS "Service role full access on crawler_jobs" ON public.crawler_jobs;
CREATE POLICY "Service role full access on crawler_jobs" ON public.crawler_jobs
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 8. crawler_samples
DROP POLICY IF EXISTS "Service role full access on crawler_samples" ON public.crawler_samples;
CREATE POLICY "Service role full access on crawler_samples" ON public.crawler_samples
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 9. sample_reports
DROP POLICY IF EXISTS "Service role can manage samples" ON public.sample_reports;
CREATE POLICY "Service role can manage samples" ON public.sample_reports
  FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- 10. raw_market_signals - fix INSERT and UPDATE policies
DROP POLICY IF EXISTS "Service role can insert signals" ON public.raw_market_signals;
CREATE POLICY "Service role can insert signals" ON public.raw_market_signals
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can update signals" ON public.raw_market_signals;
CREATE POLICY "Service role can update signals" ON public.raw_market_signals
  FOR UPDATE USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
