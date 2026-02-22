-- =====================================================
-- User Quotas & Sample Reports Migration
-- =====================================================

-- 1. Create user_quotas table for tracking TikHub usage
CREATE TABLE public.user_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  free_tikhub_used INTEGER NOT NULL DEFAULT 0,
  free_tikhub_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

-- Users can view their own quota
CREATE POLICY "Users can view own quota"
  ON public.user_quotas
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role can manage all quotas (for edge functions)
CREATE POLICY "Service role can manage quotas"
  ON public.user_quotas
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_user_quotas_updated_at
  BEFORE UPDATE ON public.user_quotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create sample_reports table for public example reports
CREATE TABLE public.sample_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  title TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sample_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can view active sample reports (public)
CREATE POLICY "Anyone can view active samples"
  ON public.sample_reports
  FOR SELECT
  USING (is_active = true);

-- Service role can manage sample reports
CREATE POLICY "Service role can manage samples"
  ON public.sample_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Create function to check TikHub quota
CREATE OR REPLACE FUNCTION public.check_tikhub_quota(p_user_id UUID)
RETURNS TABLE(can_use BOOLEAN, used INTEGER, total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure quota record exists
  INSERT INTO public.user_quotas (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN QUERY
  SELECT 
    q.free_tikhub_used < q.free_tikhub_limit AS can_use,
    q.free_tikhub_used AS used,
    q.free_tikhub_limit AS total
  FROM public.user_quotas q
  WHERE q.user_id = p_user_id;
END;
$$;

-- 4. Create function to consume one free TikHub use
CREATE OR REPLACE FUNCTION public.use_tikhub_quota(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure quota record exists first
  INSERT INTO public.user_quotas (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Increment usage
  UPDATE public.user_quotas 
  SET free_tikhub_used = free_tikhub_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- 5. Insert sample reports (only when referenced validations exist)
INSERT INTO public.sample_reports (validation_id, title, display_order)
SELECT v.validation_id, v.title, v.display_order
FROM (
  VALUES
    ('6ea1894d-3197-42de-affd-905a4d305a25'::uuid, 'API 合规 SaaS 工具', 1),
    ('7310d708-8727-4591-a20b-d1687f8cc2ef'::uuid, '投资组合收益计算器', 2)
) AS v(validation_id, title, display_order)
WHERE EXISTS (
  SELECT 1
  FROM public.validations s
  WHERE s.id = v.validation_id
);
