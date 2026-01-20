import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUUID, ValidationError, createErrorResponse } from "../_shared/validation.ts";
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
    await checkRateLimit(supabase, user.id, "delete-validation");

    // Get validation ID from body
    const body = await req.json();
    const validationId = validateUUID(body.validationId, "validationId");

    // Verify record belongs to current user
    const { data: validation, error: fetchError } = await supabase
      .from("validations")
      .select("id")
      .eq("id", validationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !validation) {
      throw new Error("Validation not found");
    }

    // Delete validation record (related reports will be cascade deleted)
    const { error: deleteError } = await supabase
      .from("validations")
      .delete()
      .eq("id", validationId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting validation:", deleteError);
      throw new Error("Failed to delete validation");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
