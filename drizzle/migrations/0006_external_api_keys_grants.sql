GRANT SELECT, INSERT, UPDATE ON public.external_api_keys TO authenticated;
GRANT ALL ON public.external_api_keys TO service_role;
GRANT ALL ON public.external_api_key_rate_buckets TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_external_api_key_rate_limit(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_external_api_key_rate_limit(UUID, INTEGER) TO service_role;