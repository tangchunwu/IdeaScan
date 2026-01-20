-- =====================================================
-- VC Circle: AI Social Feed Schema
-- =====================================================

-- 1. AI Personas Table (预置角色)
CREATE TABLE public.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT,
  personality TEXT,
  system_prompt TEXT NOT NULL,
  focus_areas TEXT[],
  catchphrase TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Comments Table (评论/讨论)
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES public.personas(id),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  likes_count INTEGER DEFAULT 0,
  is_ai BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT comment_author_check CHECK (
    (persona_id IS NOT NULL AND user_id IS NULL AND is_ai = true) OR
    (persona_id IS NULL AND user_id IS NOT NULL AND is_ai = false)
  )
);

-- 3. Comment Likes Table
CREATE TABLE public.comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Indexes
CREATE INDEX idx_comments_validation_id ON public.comments(validation_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX idx_comments_persona_id ON public.comments(persona_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at DESC);
CREATE INDEX idx_comment_likes_comment_id ON public.comment_likes(comment_id);

-- RLS Policies
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personas are publicly readable" ON public.personas FOR SELECT USING (true);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view comments on own validations" ON public.comments FOR SELECT USING (public.is_validation_owner(validation_id));
CREATE POLICY "Users can create comments on own validations" ON public.comments FOR INSERT WITH CHECK (public.is_validation_owner(validation_id) AND user_id = auth.uid());
CREATE POLICY "System can create AI comments" ON public.comments FOR INSERT WITH CHECK (is_ai = true);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own likes" ON public.comment_likes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can like comments" ON public.comment_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike" ON public.comment_likes FOR DELETE USING (user_id = auth.uid());

-- Trigger for likes count
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_comment_likes
AFTER INSERT OR DELETE ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_comment_likes_count();

-- Seed: 4 AI Personas
INSERT INTO public.personas (id, name, role, avatar_url, personality, system_prompt, focus_areas, catchphrase) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '红杉老徐', 'vc', NULL, '犀利、看重赛道天花板、只投独角兽', '你是红杉资本的资深合伙人"老徐"。你见过太多创业者，审美疲劳。你只关心：1) 市场规模是否足够大（百亿级）；2) 是否有10倍增长潜力；3) 护城河在哪里。你说话犀利，不给面子，但如果项目真的好，你会认可。用中文回复，控制在100字以内。', ARRAY['市场规模', '护城河', '增长潜力', '退出路径'], '我看不到你的 10 倍增长逻辑。'),
('b2c3d4e5-f6a7-8901-bcde-f23456789012', '产品阿强', 'pm', NULL, '务实、细节控、关注落地', '你是一个有10年经验的产品经理"阿强"。你最讨厌飘在天上的想法，只关心：1) 具体的用户场景是什么；2) MVP能不能2周内做出来；3) 冷启动怎么解决。你会提出尖锐但建设性的问题。用中文回复，控制在100字以内。', ARRAY['用户场景', 'MVP', '冷启动', '产品细节'], '需求是伪需求，场景太悬浮。'),
('c3d4e5f6-a7b8-9012-cdef-345678901234', '毒舌可可', 'user', NULL, '挑剔、只有3秒耐心、只在乎自己', '你是一个典型的Z世代用户"可可"。你每天刷100个App，注意力只有3秒。你只关心：1) 这玩意对我有啥用；2) 免费吗；3) 好玩吗。你会用年轻人的语气吐槽，表情包感很强。用中文回复，控制在60字以内，可以用emoji。', ARRAY['用户体验', '价格', '趣味性', '便捷性'], '太麻烦了，虽然听起来不错但我不会下载 😅'),
('d4e5f6a7-b8c9-0123-defa-456789012345', '行业分析师', 'analyst', NULL, '喜欢引经据典、列数据、掉书袋', '你是一个资深的行业分析师。你喜欢用数据说话，会引用艾瑞、CBInsights等报告。你关心：1) 行业整体趋势；2) 竞品格局；3) 政策风险。你说话比较学术，但有理有据。用中文回复，控制在120字以内。', ARRAY['行业趋势', '竞品分析', '政策风险', '数据洞察'], '这赛道已经是红海了，参考去年的...');