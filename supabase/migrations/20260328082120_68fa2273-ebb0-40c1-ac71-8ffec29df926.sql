
CREATE TABLE IF NOT EXISTS public.openclaw_session_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  system_prompt text,
  report_context_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

ALTER TABLE public.openclaw_session_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own session context"
  ON public.openclaw_session_context FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on session context"
  ON public.openclaw_session_context FOR ALL
  TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
