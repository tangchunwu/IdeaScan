-- =====================================================
-- Validation cost/proof schema + experiment tracking
-- =====================================================

-- 1) Extend validation_reports with proof/cost/evidence fields
ALTER TABLE public.validation_reports
ADD COLUMN IF NOT EXISTS evidence_grade TEXT DEFAULT 'C'
CHECK (evidence_grade IN ('A', 'B', 'C', 'D'));

ALTER TABLE public.validation_reports
ADD COLUMN IF NOT EXISTS cost_breakdown JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.validation_reports
ADD COLUMN IF NOT EXISTS proof_result JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.validation_reports.evidence_grade IS 'Evidence confidence grade: A/B/C/D';
COMMENT ON COLUMN public.validation_reports.cost_breakdown IS 'Validation cost metadata: llm/api call counts + token usage + estimated cost';
COMMENT ON COLUMN public.validation_reports.proof_result IS 'Business proof result from paid-intent/waitlist experiments';

-- 2) Normalize free quota defaults to 3/month across product surfaces
ALTER TABLE public.user_quotas
ALTER COLUMN free_tikhub_limit SET DEFAULT 3;

UPDATE public.user_quotas
SET free_tikhub_limit = 3
WHERE COALESCE(free_tikhub_limit, 0) < 3;

-- 3) Unify trending topic counter naming
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trending_topics'
      AND column_name = 'validate_count'
  ) THEN
    UPDATE public.trending_topics
    SET validation_count = GREATEST(
      COALESCE(validation_count, 0),
      COALESCE(validate_count, 0)
    );

    ALTER TABLE public.trending_topics
    DROP COLUMN validate_count;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.trending_topics_legacy AS
SELECT t.*, t.validation_count AS validate_count
FROM public.trending_topics t;

-- 4) Demand proof experiment model
CREATE TABLE IF NOT EXISTS public.demand_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  validation_id UUID REFERENCES public.validations(id) ON DELETE SET NULL,
  landing_page_id UUID UNIQUE REFERENCES public.mvp_landing_pages(id) ON DELETE SET NULL,
  idea TEXT NOT NULL,
  hypothesis TEXT,
  value_prop TEXT,
  cta_label TEXT NOT NULL DEFAULT 'Reserve Early Access',
  cta_type TEXT NOT NULL DEFAULT 'paid_intent'
    CHECK (cta_type IN ('paid_intent', 'waitlist')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  uv_count INTEGER NOT NULL DEFAULT 0,
  cta_click_count INTEGER NOT NULL DEFAULT 0,
  checkout_start_count INTEGER NOT NULL DEFAULT 0,
  paid_intent_count INTEGER NOT NULL DEFAULT 0,
  waitlist_submit_count INTEGER NOT NULL DEFAULT 0,
  paid_intent_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  waitlist_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  evidence_verdict TEXT NOT NULL DEFAULT 'insufficient_data',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demand_experiments_user_status
ON public.demand_experiments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_demand_experiments_validation
ON public.demand_experiments(validation_id);

ALTER TABLE public.demand_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experiments"
ON public.demand_experiments FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own experiments"
ON public.demand_experiments FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own experiments"
ON public.demand_experiments FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Service role can manage experiments"
ON public.demand_experiments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_demand_experiments_updated_at ON public.demand_experiments;
CREATE TRIGGER update_demand_experiments_updated_at
BEFORE UPDATE ON public.demand_experiments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.demand_experiments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('view', 'cta_click', 'checkout_start', 'paid_intent', 'waitlist_submit')
  ),
  event_value NUMERIC(12, 2),
  metadata JSONB DEFAULT '{}'::jsonb,
  session_id TEXT,
  anon_id TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_events_exp_type_time
ON public.experiment_events(experiment_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experiment_events_anon
ON public.experiment_events(anon_id, created_at DESC);

ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view experiment events"
ON public.experiment_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.demand_experiments d
    WHERE d.id = experiment_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage experiment events"
ON public.experiment_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.idea_proof_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.demand_experiments(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  uv_count INTEGER NOT NULL DEFAULT 0,
  paid_intent_count INTEGER NOT NULL DEFAULT 0,
  waitlist_submit_count INTEGER NOT NULL DEFAULT 0,
  paid_intent_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  waitlist_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  evidence_verdict TEXT NOT NULL DEFAULT 'insufficient_data',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_idea_proof_snapshots_exp_date
ON public.idea_proof_snapshots(experiment_id, snapshot_date DESC);

ALTER TABLE public.idea_proof_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view snapshots"
ON public.idea_proof_snapshots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.demand_experiments d
    WHERE d.id = experiment_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage snapshots"
ON public.idea_proof_snapshots FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5) Lead anti-abuse hardening
DELETE FROM public.mvp_leads a
USING public.mvp_leads b
WHERE a.id < b.id
  AND a.landing_page_id = b.landing_page_id
  AND lower(a.email) = lower(b.email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_leads_page_email_unique
ON public.mvp_leads(landing_page_id, lower(email));
