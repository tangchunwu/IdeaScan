-- Fix: Restrict personas table to authenticated users only
-- This protects AI system prompts (valuable IP) from public access

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Personas are publicly readable" ON public.personas;

-- Create a new policy that only allows authenticated users to view active personas
CREATE POLICY "Authenticated users can view active personas"
ON public.personas
FOR SELECT
TO authenticated
USING (is_active = true);