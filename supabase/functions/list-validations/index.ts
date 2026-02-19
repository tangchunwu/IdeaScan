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

    return new Response(
      JSON.stringify({ validations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
