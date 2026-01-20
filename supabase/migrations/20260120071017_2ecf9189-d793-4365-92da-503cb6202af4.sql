-- Fix: Postgres does not support CREATE POLICY IF NOT EXISTS
-- Enable RLS for rate limiting table
ALTER TABLE public.rate_limit_entries ENABLE ROW LEVEL SECURITY;

-- Recreate policies idempotently
DROP POLICY IF EXISTS "Users can view their own rate limit entries" ON public.rate_limit_entries;
DROP POLICY IF EXISTS "Users can insert their own rate limit entries" ON public.rate_limit_entries;
DROP POLICY IF EXISTS "Users can update their own rate limit entries" ON public.rate_limit_entries;

CREATE POLICY "Users can view their own rate limit entries"
ON public.rate_limit_entries
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rate limit entries"
ON public.rate_limit_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rate limit entries"
ON public.rate_limit_entries
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);