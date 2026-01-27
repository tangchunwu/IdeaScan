-- Create trending_topics table for storing discovered market trends
CREATE TABLE public.trending_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT,
  heat_score INTEGER NOT NULL DEFAULT 0,
  growth_rate DECIMAL(5,2),
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_engagement INTEGER DEFAULT 0,
  sentiment_positive INTEGER DEFAULT 0,
  sentiment_negative INTEGER DEFAULT 0,
  sentiment_neutral INTEGER DEFAULT 0,
  top_pain_points TEXT[] DEFAULT '{}',
  related_keywords TEXT[] DEFAULT '{}',
  sources JSONB DEFAULT '[]',
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for efficient querying
CREATE INDEX idx_trending_topics_heat ON public.trending_topics(heat_score DESC) WHERE is_active = true;
CREATE INDEX idx_trending_topics_category ON public.trending_topics(category) WHERE is_active = true;
CREATE INDEX idx_trending_topics_discovered ON public.trending_topics(discovered_at DESC);

-- Enable RLS
ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;

-- Public read access for active topics
CREATE POLICY "Anyone can view active trending topics"
ON public.trending_topics
FOR SELECT
USING (is_active = true);

-- Authenticated users can create topics
CREATE POLICY "Authenticated users can create trending topics"
ON public.trending_topics
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Users can update their own topics
CREATE POLICY "Users can update their own topics"
ON public.trending_topics
FOR UPDATE
TO authenticated
USING (created_by = auth.uid());

-- Create user_topic_interests for personalization
CREATE TABLE public.user_topic_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.trending_topics(id) ON DELETE CASCADE,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('saved', 'validated', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_id)
);

-- Enable RLS for user interests
ALTER TABLE public.user_topic_interests ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own interests
CREATE POLICY "Users can view own interests"
ON public.user_topic_interests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create own interests"
ON public.user_topic_interests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own interests"
ON public.user_topic_interests
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own interests"
ON public.user_topic_interests
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_trending_topics_updated_at
BEFORE UPDATE ON public.trending_topics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();