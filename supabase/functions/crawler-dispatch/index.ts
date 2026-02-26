import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchCrawlerJob } from "../_shared/crawler-router.ts";
import { validateString, ValidationError, createErrorResponse } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new ValidationError("Authorization required");

    const body = await req.json();
    const validationId = validateString(body?.validation_id, "validation_id", 64, true)!;
    const query = validateString(body?.query, "query", 120, true)!;
    const mode = body?.mode === "deep" ? "deep" : "quick";
    const enableXiaohongshu = body?.enableXiaohongshu !== false;
    const enableDouyin = false;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      throw new ValidationError("Invalid or expired session");
    }

    const { data: validation, error: validationError } = await supabase
      .from("validations")
      .select("id, user_id")
      .eq("id", validationId)
      .single();

    if (validationError || !validation || validation.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Validation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await dispatchCrawlerJob({
      supabase,
      validationId,
      userId: user.id,
      query,
      mode,
      enableXiaohongshu,
      enableDouyin,
      source: "self_crawler",
      freshnessDays: Number(body?.freshness_days || 14),
      timeoutMs: Number(body?.timeout_ms || 12000),
    });

    if (!result) {
      return new Response(JSON.stringify({ error: "Crawler service disabled" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result.dispatched) {
      return new Response(JSON.stringify({ error: result.error || "Dispatch failed", job_id: result.jobId }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: result.jobId,
        external_job_id: result.externalJobId || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsHeaders);
  }
});
