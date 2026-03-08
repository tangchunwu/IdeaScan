-- Drop the unsafe INSERT policy that has no role restriction
DROP POLICY IF EXISTS "Allow service role insert" ON public.raw_market_signals;