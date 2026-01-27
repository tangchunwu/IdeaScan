-- Add unique constraint on keyword for upsert functionality
ALTER TABLE public.trending_topics ADD CONSTRAINT trending_topics_keyword_unique UNIQUE (keyword);

-- Enable pg_cron and pg_net extensions for scheduled scans
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;