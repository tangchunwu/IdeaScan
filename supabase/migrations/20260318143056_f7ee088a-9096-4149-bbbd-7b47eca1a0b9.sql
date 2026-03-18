CREATE OR REPLACE FUNCTION public.get_completed_validation_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM validations WHERE status = 'completed';
$$;