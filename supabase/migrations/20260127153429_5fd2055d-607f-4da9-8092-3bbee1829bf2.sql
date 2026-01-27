-- =============================================
-- MVP Landing Pages & Leads Tables
-- Phase 8: MVP Generator Feature
-- =============================================

-- Create mvp_landing_pages table
CREATE TABLE public.mvp_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  validation_id UUID REFERENCES public.validations(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme TEXT NOT NULL DEFAULT 'default',
  is_published BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create mvp_leads table
CREATE TABLE public.mvp_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.mvp_landing_pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mvp_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mvp_leads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies for mvp_landing_pages
-- =============================================

-- Users can view their own landing pages
CREATE POLICY "Users can view own landing pages"
ON public.mvp_landing_pages FOR SELECT
USING (user_id = auth.uid());

-- Anyone can view published landing pages (for public access)
CREATE POLICY "Anyone can view published landing pages"
ON public.mvp_landing_pages FOR SELECT
USING (is_published = true);

-- Users can create their own landing pages
CREATE POLICY "Users can create own landing pages"
ON public.mvp_landing_pages FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own landing pages
CREATE POLICY "Users can update own landing pages"
ON public.mvp_landing_pages FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own landing pages
CREATE POLICY "Users can delete own landing pages"
ON public.mvp_landing_pages FOR DELETE
USING (user_id = auth.uid());

-- =============================================
-- RLS Policies for mvp_leads
-- =============================================

-- Landing page owners can view leads for their pages
CREATE POLICY "Owners can view leads"
ON public.mvp_leads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mvp_landing_pages
    WHERE id = landing_page_id AND user_id = auth.uid()
  )
);

-- Anyone can submit leads to published landing pages
CREATE POLICY "Anyone can submit leads to published pages"
ON public.mvp_leads FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.mvp_landing_pages
    WHERE id = landing_page_id AND is_published = true
  )
);

-- =============================================
-- Indexes for performance
-- =============================================

CREATE INDEX idx_mvp_landing_pages_user_id ON public.mvp_landing_pages(user_id);
CREATE INDEX idx_mvp_landing_pages_slug ON public.mvp_landing_pages(slug);
CREATE INDEX idx_mvp_landing_pages_validation_id ON public.mvp_landing_pages(validation_id);
CREATE INDEX idx_mvp_leads_landing_page_id ON public.mvp_leads(landing_page_id);
CREATE INDEX idx_mvp_leads_email ON public.mvp_leads(email);

-- =============================================
-- Trigger for updated_at
-- =============================================

CREATE TRIGGER update_mvp_landing_pages_updated_at
  BEFORE UPDATE ON public.mvp_landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();