-- Create user_feedback table for storing user feedback
CREATE TABLE public.user_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  page_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own feedback
CREATE POLICY "Users can submit feedback"
ON public.user_feedback
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anonymous feedback (no user_id required)
CREATE POLICY "Anonymous feedback allowed"
ON public.user_feedback
FOR INSERT
WITH CHECK (user_id IS NULL);

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
ON public.user_feedback
FOR SELECT
USING (auth.uid() = user_id);

-- Add index for faster queries
CREATE INDEX idx_user_feedback_user_id ON public.user_feedback(user_id);
CREATE INDEX idx_user_feedback_created_at ON public.user_feedback(created_at DESC);