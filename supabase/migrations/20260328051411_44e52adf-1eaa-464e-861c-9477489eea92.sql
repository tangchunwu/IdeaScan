
CREATE TABLE public.openclaw_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  machine_name text DEFAULT 'default',
  backend text DEFAULT 'claude',
  work_dir text DEFAULT '.',
  claimed_by uuid,
  connection_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.openclaw_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.openclaw_pairing_codes
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Auth users can select" ON public.openclaw_pairing_codes
  FOR SELECT TO authenticated USING (true);
