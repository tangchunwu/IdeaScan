-- =============================================
-- MVP Generator follow-up (idempotent)
-- =============================================
-- NOTE:
-- Base MVP tables are already created in:
--   20260127070000_add_mvp_generator_tables.sql
-- This migration only applies additive, repeat-safe changes.

-- Additional indexes for query performance
CREATE INDEX IF NOT EXISTS idx_mvp_landing_pages_validation_id
ON public.mvp_landing_pages(validation_id);

CREATE INDEX IF NOT EXISTS idx_mvp_leads_email
ON public.mvp_leads(email);

-- Ensure updated_at trigger exists (safe re-run)
DROP TRIGGER IF EXISTS update_mvp_landing_pages_updated_at ON public.mvp_landing_pages;
CREATE TRIGGER update_mvp_landing_pages_updated_at
  BEFORE UPDATE ON public.mvp_landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
