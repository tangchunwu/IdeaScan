-- Add DELETE policy for user_settings table to allow users to delete their own settings
-- This fixes the GDPR compliance issue and prevents orphaned data

CREATE POLICY "Users can delete their own settings"
ON public.user_settings
FOR DELETE
USING (auth.uid() = user_id);