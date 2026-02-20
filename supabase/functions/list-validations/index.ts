import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user } = await resolveAuthUserOrBypass(supabase, req);

    // Check rate limit
    await checkRateLimit(supabase, user.id, "list-validations");

    // Auto-heal stale processing records to avoid indefinite "分析中".
    const staleThresholdIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await supabase
      .from("validations")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "processing")
      .lt("updated_at", staleThresholdIso);

    // Get user's validations
    const { data: validations, error: validationsError } = await supabase
      .from("validations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (validationsError) {
      console.error("Error fetching validations:", validationsError);
      throw new Error("Failed to fetch validations");
    }

    const rows = Array.isArray(validations) ? validations : [];
    const candidateIds = rows
      .filter((item: any) => item?.status === "failed" || item?.status === "processing")
      .map((item: any) => String(item?.id || ""))
      .filter(Boolean);
    const reportMap = new Map<string, any>();
    if (candidateIds.length > 0) {
      const { data: reports } = await supabase
        .from("validation_reports")
        .select("validation_id, data_summary")
        .in("validation_id", candidateIds);
      for (const item of reports || []) {
        reportMap.set(String(item.validation_id || ""), item.data_summary || {});
      }
    }
    const nowMs = Date.now();
    const resumableValidations = rows.map((item: any) => {
      const status = String(item?.status || "");
      const summary = reportMap.get(String(item?.id || "")) || {};
      const stage = String(summary?.checkpointStage || "").toLowerCase();
      const checkpointUpdatedAt = String(summary?.checkpointUpdatedAt || "");
      const checkpointMs = checkpointUpdatedAt ? Date.parse(checkpointUpdatedAt) : 0;
      const staleAnalyze = checkpointMs > 0 && (nowMs - checkpointMs >= 120000);
      const resumable = status === "failed" || (
        status === "processing"
        && staleAnalyze
        && (stage.includes("analyze") || stage.includes("summarize"))
      );
      return {
        ...item,
        resumable,
        resume_hint: resumable
          ? (status === "failed" ? "failed_record" : `stale_${stage || "processing"}`)
          : "",
      };
    });

    return new Response(
      JSON.stringify({ validations: resumableValidations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
