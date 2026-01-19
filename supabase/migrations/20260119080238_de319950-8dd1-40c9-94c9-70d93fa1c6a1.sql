-- 创建验证状态枚举
CREATE TYPE public.validation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- 创建验证记录表
CREATE TABLE public.validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  idea TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status validation_status NOT NULL DEFAULT 'pending',
  overall_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建验证报告表（存储详细报告数据）
CREATE TABLE public.validation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  
  -- 市场分析数据
  market_analysis JSONB DEFAULT '{}',
  
  -- 小红书数据
  xiaohongshu_data JSONB DEFAULT '{}',
  
  -- 情感分析数据
  sentiment_analysis JSONB DEFAULT '{}',
  
  -- AI分析建议
  ai_analysis JSONB DEFAULT '{}',
  
  -- 多维度评分
  dimensions JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX idx_validations_user_id ON public.validations(user_id);
CREATE INDEX idx_validations_status ON public.validations(status);
CREATE INDEX idx_validations_created_at ON public.validations(created_at DESC);
CREATE INDEX idx_validation_reports_validation_id ON public.validation_reports(validation_id);

-- 启用 RLS
ALTER TABLE public.validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_reports ENABLE ROW LEVEL SECURITY;

-- 创建 helper 函数：检查用户是否拥有该验证记录
CREATE OR REPLACE FUNCTION public.is_validation_owner(validation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.validations
    WHERE id = validation_id AND user_id = auth.uid()
  )
$$;

-- RLS 策略：validations 表
CREATE POLICY "Users can view own validations"
  ON public.validations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own validations"
  ON public.validations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own validations"
  ON public.validations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own validations"
  ON public.validations FOR DELETE
  USING (user_id = auth.uid());

-- RLS 策略：validation_reports 表
CREATE POLICY "Users can view own validation reports"
  ON public.validation_reports FOR SELECT
  USING (public.is_validation_owner(validation_id));

CREATE POLICY "System can create validation reports"
  ON public.validation_reports FOR INSERT
  WITH CHECK (public.is_validation_owner(validation_id));

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_validations_updated_at
  BEFORE UPDATE ON public.validations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();