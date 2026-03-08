-- Allow admins to delete trending topics
CREATE POLICY "Admins can delete trending topics"
  ON public.trending_topics
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update any trending topic (e.g. deactivate)
DROP POLICY IF EXISTS "Users can update their own topics" ON public.trending_topics;
CREATE POLICY "Owners or admins can update trending topics"
  ON public.trending_topics
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));