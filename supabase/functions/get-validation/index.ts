import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUUID, ValidationError, createErrorResponse, LIMITS } from "../_shared/validation.ts";
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
    await checkRateLimit(supabase, user.id, "get-validation");

    // Get validation ID (support body or query params)
    let validationId: string | null = null;
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.id) {
          validationId = validateUUID(body.id, "id");
        }
      } catch {
        // ignore parse error
      }
    }
    
    if (!validationId) {
      const url = new URL(req.url);
      const idParam = url.searchParams.get("id");
      if (idParam) {
        validationId = validateUUID(idParam, "id");
      }
    }

    if (!validationId) {
      throw new ValidationError("Validation ID is required");
    }

    // Check if this is a sample report (publicly viewable)
    const { data: sampleReport } = await supabase
      .from("sample_reports")
      .select("id")
      .eq("validation_id", validationId)
      .eq("is_active", true)
      .maybeSingle();

    const isSample = !!sampleReport;

    // Get validation record - skip user_id check for sample reports
    const query = supabase
      .from("validations")
      .select("*")
      .eq("id", validationId);

    if (!isSample) {
      query.eq("user_id", user.id);
    }

    const { data: validation, error: validationError } = await query.maybeSingle();

    if (validationError) {
      console.error("Error fetching validation:", validationError);
      throw new Error("Failed to fetch validation");
    }

    if (!validation) {
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

    return new Response(
      JSON.stringify({
        validation,
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
