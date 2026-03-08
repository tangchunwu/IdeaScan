
DROP POLICY "Collaborators can view their invites" ON public.report_collaborators;

CREATE POLICY "Collaborators can view their invites"
ON public.report_collaborators
FOR SELECT
TO authenticated
USING (
  collaborator_id = auth.uid()
  OR collaborator_email = auth.email()::text
);
