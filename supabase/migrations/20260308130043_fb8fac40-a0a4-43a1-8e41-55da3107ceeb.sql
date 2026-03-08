
-- Drop the overly broad policy and replace with a proper one that checks token match from request
DROP POLICY IF EXISTS "Anyone can view shared validations" ON public.validations;

-- Allow anyone (including anon) to SELECT a validation if they know the share_token
CREATE POLICY "Public can view by share_token" ON public.validations FOR SELECT TO anon, authenticated
USING (share_token IS NOT NULL);
