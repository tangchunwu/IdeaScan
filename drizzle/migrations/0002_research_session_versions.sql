ALTER TABLE public.research_sessions
  ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
  ADD COLUMN IF NOT EXISTS parent_session_id uuid REFERENCES public.research_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_summary text NOT NULL DEFAULT '首次研究' CHECK (char_length(change_summary) <= 500);
CREATE INDEX IF NOT EXISTS research_sessions_version_chain ON public.research_sessions(user_id, parent_session_id, version_no DESC);
