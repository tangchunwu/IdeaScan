
-- 1. Add new columns to validation_reports
ALTER TABLE public.validation_reports
  ADD COLUMN IF NOT EXISTS evidence_grade text,
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS proof_result jsonb DEFAULT '{"paid_intent_rate":0,"waitlist_rate":0,"sample_uv":0,"verdict":"pending_experiment"}'::jsonb;

-- 2. Update free_tikhub_limit default to 3 and backfill
ALTER TABLE public.user_quotas ALTER COLUMN free_tikhub_limit SET DEFAULT 3;
UPDATE public.user_quotas SET free_tikhub_limit = 3 WHERE free_tikhub_limit = 1;

-- 3. Create demand_experiments table
CREATE TABLE IF NOT EXISTS public.demand_experiments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  validation_id uuid REFERENCES public.validations(id) ON DELETE SET NULL,
  landing_page_id uuid REFERENCES public.mvp_landing_pages(id) ON DELETE SET NULL,
  idea text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  cta_type text NOT NULL DEFAULT 'paid_intent',
  cta_label text DEFAULT 'Reserve Early Access',
  uv_count integer NOT NULL DEFAULT 0,
  cta_click_count integer NOT NULL DEFAULT 0,
  checkout_start_count integer NOT NULL DEFAULT 0,
  paid_intent_count integer NOT NULL DEFAULT 0,
  waitlist_submit_count integer NOT NULL DEFAULT 0,
  paid_intent_rate numeric NOT NULL DEFAULT 0,
  waitlist_rate numeric NOT NULL DEFAULT 0,
  evidence_verdict text NOT NULL DEFAULT 'insufficient_data',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demand_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experiments" ON public.demand_experiments
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own experiments" ON public.demand_experiments
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own experiments" ON public.demand_experiments
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Service role full access on experiments" ON public.demand_experiments
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Create experiment_events table
CREATE TABLE IF NOT EXISTS public.experiment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.demand_experiments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  anon_id text,
  session_id text,
  user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on events" ON public.experiment_events
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own experiment events" ON public.experiment_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.demand_experiments de WHERE de.id = experiment_id AND de.user_id = auth.uid())
  );

-- 5. Create idea_proof_snapshots table
CREATE TABLE IF NOT EXISTS public.idea_proof_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.demand_experiments(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  uv_count integer NOT NULL DEFAULT 0,
  paid_intent_count integer NOT NULL DEFAULT 0,
  waitlist_submit_count integer NOT NULL DEFAULT 0,
  paid_intent_rate numeric NOT NULL DEFAULT 0,
  waitlist_rate numeric NOT NULL DEFAULT 0,
  evidence_verdict text NOT NULL DEFAULT 'insufficient_data',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, snapshot_date)
);

ALTER TABLE public.idea_proof_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on snapshots" ON public.idea_proof_snapshots
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own snapshots" ON public.idea_proof_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.demand_experiments de WHERE de.id = experiment_id AND de.user_id = auth.uid())
  );

-- 6. Add unique index on mvp_leads to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mvp_leads_landing_page_email_uniq') THEN
    -- Remove duplicates first keeping earliest
    DELETE FROM public.mvp_leads a USING public.mvp_leads b
    WHERE a.landing_page_id = b.landing_page_id
      AND lower(a.email) = lower(b.email)
      AND a.created_at > b.created_at;

    CREATE UNIQUE INDEX mvp_leads_landing_page_email_uniq
      ON public.mvp_leads (landing_page_id, lower(email));
  END IF;
END $$;

-- 7. Add validation_count to trending_topics if missing
ALTER TABLE public.trending_topics ADD COLUMN IF NOT EXISTS validation_count integer DEFAULT 0;

-- 8. Update trigger for demand_experiments
CREATE TRIGGER update_demand_experiments_updated_at
  BEFORE UPDATE ON public.demand_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
