-- =============================================
-- 用户热点行为追踪表
-- 记录用户在热点雷达页的点击、展开、验证行为
-- =============================================

CREATE TABLE IF NOT EXISTS public.user_topic_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  topic_id UUID REFERENCES public.trending_topics(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  click_type TEXT NOT NULL CHECK (click_type IN ('view', 'expand', 'validate', 'bookmark')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引用于高效查询
CREATE INDEX IF NOT EXISTS idx_topic_clicks_topic ON public.user_topic_clicks(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_clicks_keyword ON public.user_topic_clicks(keyword);
CREATE INDEX IF NOT EXISTS idx_topic_clicks_created ON public.user_topic_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_topic_clicks_user ON public.user_topic_clicks(user_id);

-- 启用 RLS
ALTER TABLE public.user_topic_clicks ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can insert their own clicks"
  ON public.user_topic_clicks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own clicks"
  ON public.user_topic_clicks FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================
-- 扩展 trending_topics 表增加优先级统计
-- =============================================

ALTER TABLE public.trending_topics
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS validate_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority_score NUMERIC DEFAULT 0;

-- =============================================
-- 创建触发器自动更新优先级分数
-- =============================================

CREATE OR REPLACE FUNCTION public.update_topic_priority()
RETURNS TRIGGER AS $$
DECLARE
  v_topic_id UUID;
  v_keyword TEXT;
BEGIN
  v_topic_id := NEW.topic_id;
  v_keyword := NEW.keyword;
  
  -- 更新对应热点的统计数据
  IF v_topic_id IS NOT NULL THEN
    UPDATE public.trending_topics
    SET
      click_count = (
        SELECT COUNT(*) FROM public.user_topic_clicks 
        WHERE topic_id = v_topic_id
      ),
      validate_count = (
        SELECT COUNT(*) FROM public.user_topic_clicks 
        WHERE topic_id = v_topic_id AND click_type = 'validate'
      ),
      priority_score = (
        SELECT (
          COUNT(*) * 1 + 
          SUM(CASE WHEN click_type = 'validate' THEN 5 ELSE 0 END) +
          SUM(CASE WHEN click_type = 'bookmark' THEN 3 ELSE 0 END)
        )
        FROM public.user_topic_clicks
        WHERE topic_id = v_topic_id
          AND created_at > NOW() - INTERVAL '7 days'
      ),
      updated_at = NOW()
    WHERE id = v_topic_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_update_topic_priority ON public.user_topic_clicks;
CREATE TRIGGER trigger_update_topic_priority
AFTER INSERT ON public.user_topic_clicks
FOR EACH ROW EXECUTE FUNCTION public.update_topic_priority();