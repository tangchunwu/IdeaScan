CREATE TABLE public.research_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1000000),
  outcomes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(outcomes) = 'object' AND octet_length(outcomes::text) <= 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_sessions_owner_created ON public.research_sessions(user_id, created_at DESC);
ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_sessions TO authenticated;
CREATE POLICY research_sessions_read ON public.research_sessions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY research_sessions_insert ON public.research_sessions FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY research_sessions_update ON public.research_sessions FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY research_sessions_delete ON public.research_sessions FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));