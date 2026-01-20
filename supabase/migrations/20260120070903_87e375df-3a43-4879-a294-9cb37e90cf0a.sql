-- Rate limiting storage
CREATE TABLE IF NOT EXISTS public.rate_limit_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint, window_start)
);

-- Helpful index for cleanup/queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_user_endpoint_window
  ON public.rate_limit_entries (user_id, endpoint, window_start DESC);

-- Minimal access: no direct public access
REVOKE ALL ON TABLE public.rate_limit_entries FROM PUBLIC;

-- RPC for rate limiting
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_endpoint IS NULL OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN TRUE;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_entries (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, v_window_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE
    SET request_count = public.rate_limit_entries.request_count + 1,
        updated_at = now()
  RETURNING request_count INTO v_count;

  IF v_count > p_max_requests THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Lock down function execution
REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;