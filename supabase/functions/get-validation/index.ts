import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUUID, ValidationError, createErrorResponse, LIMITS } from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";

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
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new ValidationError("Authorization required");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new ValidationError("Invalid or expired session");
    }

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

    // Get validation record
    const { data: validation, error: validationError } = await supabase
      .from("validations")
      .select("*")
      .eq("id", validationId)
      .eq("user_id", user.id)
      .maybeSingle();

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
