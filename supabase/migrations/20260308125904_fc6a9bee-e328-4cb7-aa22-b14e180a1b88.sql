
ALTER TABLE public.validations ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_validations_share_token ON public.validations(share_token) WHERE share_token IS NOT NULL;

CREATE POLICY "Anyone can view shared validations" ON public.validations FOR SELECT USING (share_token IS NOT NULL AND share_token = share_token);

CREATE POLICY "Anyone can view shared validation reports" ON public.validation_reports FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.validations v 
    WHERE v.id = validation_reports.validation_id 
    AND v.share_token IS NOT NULL
  )
);
