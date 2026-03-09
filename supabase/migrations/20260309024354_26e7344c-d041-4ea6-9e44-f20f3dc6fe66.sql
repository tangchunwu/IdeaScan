
-- Create content_drafts table
CREATE TABLE public.content_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  validation_id UUID REFERENCES public.validations(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform TEXT NOT NULL DEFAULT 'xiaohongshu',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  images TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'draft',
  openclaw_session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage own drafts
CREATE POLICY "Users can view own drafts" ON public.content_drafts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create own drafts" ON public.content_drafts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own drafts" ON public.content_drafts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own drafts" ON public.content_drafts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access on content_drafts" ON public.content_drafts
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Index for quick lookups
CREATE INDEX idx_content_drafts_user_id ON public.content_drafts(user_id);
CREATE INDEX idx_content_drafts_status ON public.content_drafts(status);
