-- Add persona column to validation_reports table
ALTER TABLE public.validation_reports 
ADD COLUMN IF NOT EXISTS persona jsonb DEFAULT NULL;