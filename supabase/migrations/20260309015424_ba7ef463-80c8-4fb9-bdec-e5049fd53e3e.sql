
CREATE TABLE public.scheduler_config (
  id text PRIMARY KEY DEFAULT 'hunter_scheduler',
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 60,
  last_toggled_at timestamptz DEFAULT now(),
  toggled_by uuid
);

ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read scheduler config"
  ON public.scheduler_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update scheduler config"
  ON public.scheduler_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.scheduler_config (id, enabled, interval_minutes)
VALUES ('hunter_scheduler', false, 60);
