
CREATE TABLE public.admin_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL DEFAULT '',
  config_group TEXT NOT NULL DEFAULT 'llm',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.admin_api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON public.admin_api_configs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_write" ON public.admin_api_configs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
