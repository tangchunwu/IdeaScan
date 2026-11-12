ALTER TABLE public.admin_api_configs
  ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'openai_compatible',
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.admin_api_configs.protocol IS '请求协议：openai_chat/openai_images/openai_videos/openai_compatible/search_* / custom';
COMMENT ON COLUMN public.admin_api_configs.capabilities IS '该提供商支持的能力标签，如 text,image,video,search';