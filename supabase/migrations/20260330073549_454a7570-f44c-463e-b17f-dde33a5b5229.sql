
-- Drop old single-value table and recreate as pool-based
DROP TABLE IF EXISTS public.admin_api_configs;

CREATE TABLE public.admin_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_group TEXT NOT NULL DEFAULT 'llm',
  priority INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

CREATE INDEX idx_admin_api_configs_group_priority ON public.admin_api_configs (config_group, priority);
