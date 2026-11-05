CREATE TABLE IF NOT EXISTS public.external_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '默认 API Key',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['opportunity:read', 'validation:run'],
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30 CHECK (rate_limit_per_minute BETWEEN 1 AND 600),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own external API keys"
  ON public.external_api_keys FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own external API keys"
  ON public.external_api_keys FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke own external API keys"
  ON public.external_api_keys FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_external_api_keys_user_active
  ON public.external_api_keys(user_id, revoked_at, created_at DESC);
