ALTER TABLE public.validations ADD COLUMN active_run_id uuid;

CREATE OR REPLACE FUNCTION public.write_validation_run_report(
  p_validation_id uuid, p_user_id uuid, p_run_id uuid, p_report jsonb,
  p_finish boolean DEFAULT false, p_score integer DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_validation public.validations%ROWTYPE; v_report_id uuid; v_current public.validation_reports%ROWTYPE;
BEGIN
  IF p_report IS NULL OR jsonb_typeof(p_report) <> 'object' OR octet_length(p_report::text) > 2000000 THEN
    RAISE EXCEPTION 'invalid report payload';
  END IF;
  SELECT * INTO v_validation FROM public.validations WHERE id=p_validation_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_validation.status <> 'processing' OR v_validation.active_run_id IS DISTINCT FROM p_run_id THEN RETURN false; END IF;
  SELECT id INTO v_report_id FROM public.validation_reports WHERE validation_id=p_validation_id ORDER BY created_at,id LIMIT 1;
  IF v_report_id IS NULL THEN
    INSERT INTO public.validation_reports(validation_id) VALUES (p_validation_id) RETURNING id INTO v_report_id;
  END IF;
  IF p_finish THEN
    IF p_report#>>'{data_summary,cancelled}' = 'true' THEN
      SELECT * INTO v_current FROM public.validation_reports WHERE id=v_report_id;
      IF COALESCE(jsonb_array_length(v_current.xiaohongshu_data->'sampleNotes'),0) > COALESCE(jsonb_array_length(p_report#>'{xiaohongshu_data,sampleNotes}'),0)
        OR COALESCE(jsonb_array_length(v_current.xiaohongshu_data->'sampleComments'),0) > COALESCE(jsonb_array_length(p_report#>'{xiaohongshu_data,sampleComments}'),0) THEN
        p_report=jsonb_set(p_report,'{xiaohongshu_data}',v_current.xiaohongshu_data);
        p_report=jsonb_set(p_report,'{data_summary,sampleCounts,posts}',to_jsonb(COALESCE(jsonb_array_length(v_current.xiaohongshu_data->'sampleNotes'),0)));
        p_report=jsonb_set(p_report,'{data_summary,sampleCounts,comments}',to_jsonb(COALESCE(jsonb_array_length(v_current.xiaohongshu_data->'sampleComments'),0)));
      END IF;
      IF COALESCE(jsonb_array_length(v_current.competitor_data),0)>COALESCE(jsonb_array_length(p_report->'competitor_data'),0) THEN
        p_report=jsonb_set(p_report,'{competitor_data}',v_current.competitor_data);
      END IF;
    END IF;
    UPDATE public.validation_reports SET
      market_analysis=COALESCE(p_report->'market_analysis','{}'::jsonb),
      xiaohongshu_data=COALESCE(p_report->'xiaohongshu_data','{}'::jsonb),
      competitor_data=COALESCE(p_report->'competitor_data','[]'::jsonb),
      sentiment_analysis=COALESCE(p_report->'sentiment_analysis','{}'::jsonb),
      ai_analysis=COALESCE(p_report->'ai_analysis','{}'::jsonb),
      dimensions=COALESCE(p_report->'dimensions','[]'::jsonb),persona=p_report->'persona',
      data_summary=COALESCE(p_report->'data_summary','{}'::jsonb),
      data_quality_score=(p_report->>'data_quality_score')::integer,
      keywords_used=COALESCE(p_report->'keywords_used','{}'::jsonb),
      evidence_grade=p_report->>'evidence_grade',
      cost_breakdown=COALESCE(p_report->'cost_breakdown','{}'::jsonb),
      proof_result=COALESCE(p_report->'proof_result','{}'::jsonb)
    WHERE id=v_report_id;
    UPDATE public.validations SET status='completed',overall_score=p_score,updated_at=now() WHERE id=p_validation_id;
  ELSE
    UPDATE public.validation_reports SET
      data_summary=COALESCE(data_summary,'{}'::jsonb)||COALESCE(p_report->'data_summary','{}'::jsonb),
      xiaohongshu_data=COALESCE(p_report->'xiaohongshu_data',xiaohongshu_data),
      competitor_data=COALESCE(p_report->'competitor_data',competitor_data)
    WHERE id=v_report_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.write_validation_run_report(uuid,uuid,uuid,jsonb,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_validation_run_report(uuid,uuid,uuid,jsonb,boolean,integer) TO service_role;