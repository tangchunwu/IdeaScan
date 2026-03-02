// v2 - force redeploy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUUID, ValidationError, createErrorResponse, LIMITS } from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve user via Authorization header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token) {
        // Try getClaims first (works with signing-keys)
        try {
          const { data: claimsData, error: claimsError } = await (supabase.auth as any).getClaims(token);
          if (!claimsError && claimsData?.claims?.sub) {
            userId = claimsData.claims.sub;
            console.log("[get-validation] User resolved via getClaims:", userId);
          }
        } catch {
          // getClaims not available, fallback
        }

        // Fallback to getUser
        if (!userId) {
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data?.user?.id) {
            userId = data.user.id;
            console.log("[get-validation] User resolved via getUser:", userId);
          } else {
            console.warn("[get-validation] getUser failed:", error?.message);
          }
        }
      }
    }

    if (!userId) {
      // Check bypass mode
      const raw = String(Deno.env.get("DISABLE_APP_AUTH") || "").toLowerCase().trim();
      const bypassEnabled = raw === "1" || raw === "true" || raw === "yes";
      if (!bypassEnabled) {
        throw new ValidationError("Invalid or expired session");
      }
      const envUserId = String(Deno.env.get("DEV_AUTH_USER_ID") || "").trim();
      if (envUserId) {
        userId = envUserId;
      } else {
        const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        const firstUser = listRes?.data?.users?.[0];
        if (firstUser?.id) userId = firstUser.id;
        else throw new ValidationError("No users found for bypass");
      }
    }

    // Check rate limit
    await checkRateLimit(supabase, userId, "get-validation");

    // Get validation ID
    let validationId: string | null = null;
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.id) validationId = validateUUID(body.id, "id");
      } catch { /* ignore */ }
    }
    
    if (!validationId) {
      const url = new URL(req.url);
      const idParam = url.searchParams.get("id");
      if (idParam) validationId = validateUUID(idParam, "id");
    }

    if (!validationId) {
      throw new ValidationError("Validation ID is required");
    }

    console.log(`[get-validation] Looking up validation=${validationId} for user=${userId}`);

    // Check if this is a sample report
    const { data: sampleReport } = await supabase
      .from("sample_reports")
      .select("id")
      .eq("validation_id", validationId)
      .eq("is_active", true)
      .maybeSingle();

    const isSample = !!sampleReport;

    // Get validation record
    const query = supabase
      .from("validations")
      .select("*")
      .eq("id", validationId);

    if (!isSample) {
      query.eq("user_id", userId);
    }

    const { data: validation, error: validationError } = await query.maybeSingle();

    if (validationError) {
      console.error("[get-validation] DB error:", validationError);
      throw new Error("Failed to fetch validation");
    }

    if (!validation) {
      console.error(`[get-validation] Not found: id=${validationId}, user=${userId}, isSample=${isSample}`);
      throw new Error("Validation not found");
    }

    // Get report data
    const { data: report, error: reportError } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("validation_id", validationId)
      .maybeSingle();

    if (reportError) {
      console.error("Error fetching report:", reportError);
    }

    const summary = (report?.data_summary && typeof report.data_summary === "object")
      ? report.data_summary as Record<string, unknown>
      : {};
    const stage = String(summary?.checkpointStage || "").toLowerCase();
    const checkpointUpdatedAt = String(summary?.checkpointUpdatedAt || "");
    const checkpointMs = checkpointUpdatedAt ? Date.parse(checkpointUpdatedAt) : 0;
    const staleAnalyze = checkpointMs > 0 && (Date.now() - checkpointMs >= 120000);
    const resumable = validation.status === "failed" || (
      validation.status === "processing"
      && staleAnalyze
      && (stage.includes("analyze") || stage.includes("summarize"))
    );

    return new Response(
      JSON.stringify({
        validation: {
          ...validation,
          resumable,
          resume_hint: resumable
            ? (validation.status === "failed" ? "failed_record" : `stale_${stage || "processing"}`)
            : "",
        },
        report,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
