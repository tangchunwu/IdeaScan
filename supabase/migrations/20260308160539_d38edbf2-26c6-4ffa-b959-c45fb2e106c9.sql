
-- openclaw_connections table
CREATE TABLE public.openclaw_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  url TEXT NOT NULL,
  token TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.openclaw_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connections" ON public.openclaw_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- openclaw_messages table
CREATE TABLE public.openclaw_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  connection_id UUID REFERENCES public.openclaw_connections(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.openclaw_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.openclaw_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_openclaw_messages_session ON public.openclaw_messages(user_id, session_id, created_at);
