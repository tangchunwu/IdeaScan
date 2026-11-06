CREATE TABLE IF NOT EXISTS public.external_api_key_rate_buckets (
  key_id UUID NOT NULL REFERENCES public.external_api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

ALTER TABLE public.external_api_key_rate_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_external_api_key_rate_limit(
  p_key_id UUID,
  p_limit INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  bucket TIMESTAMPTZ := date_trunc('minute', now());
  next_count INTEGER;
BEGIN
  INSERT INTO public.external_api_key_rate_buckets(key_id, window_start, request_count)
  VALUES (p_key_id, bucket, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE
    SET request_count = external_api_key_rate_buckets.request_count + 1
  RETURNING request_count INTO next_count;
  DELETE FROM public.external_api_key_rate_buckets WHERE window_start < now() - interval '2 hours';
  RETURN next_count <= GREATEST(1, p_limit);
END;
$$;
