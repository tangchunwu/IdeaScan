
-- 1. Report notes table (private notes per user per validation)
CREATE TABLE public.report_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, validation_id)
);

ALTER TABLE public.report_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" ON public.report_notes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own notes" ON public.report_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notes" ON public.report_notes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notes" ON public.report_notes
  FOR DELETE USING (user_id = auth.uid());

-- 2. Report collaborators table (invite team members)
CREATE TABLE public.report_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  collaborator_email TEXT NOT NULL,
  collaborator_id UUID,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'comment')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(validation_id, collaborator_email)
);

ALTER TABLE public.report_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage collaborators" ON public.report_collaborators
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Collaborators can view their invites" ON public.report_collaborators
  FOR SELECT USING (collaborator_id = auth.uid() OR collaborator_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Allow collaborators to view the validation they've been invited to
CREATE POLICY "Collaborators can view shared validations" ON public.validations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.report_collaborators rc
      WHERE rc.validation_id = validations.id
        AND rc.status = 'accepted'
        AND (rc.collaborator_id = auth.uid())
    )
  );

-- Allow collaborators to view shared validation reports
CREATE POLICY "Collaborators can view shared reports" ON public.validation_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.report_collaborators rc
      WHERE rc.validation_id = validation_reports.validation_id
        AND rc.status = 'accepted'
        AND (rc.collaborator_id = auth.uid())
    )
  );

-- 3. Weekly digest preferences
CREATE TABLE public.weekly_digest_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_digest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own digest prefs" ON public.weekly_digest_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
