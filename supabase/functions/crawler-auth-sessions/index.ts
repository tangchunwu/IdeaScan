import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { user } = await resolveAuthUserOrBypass(supabase, req);

    const serviceBaseUrl = Deno.env.get("CRAWLER_SERVICE_BASE_URL");
    if (!serviceBaseUrl) {
      return new Response(JSON.stringify({ user_id: user.id, sessions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceToken = Deno.env.get("CRAWLER_SERVICE_TOKEN") || "";
    const endpoint = `${serviceBaseUrl.replace(/\/$/, "")}/internal/v1/auth/sessions/user/${user.id}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "List sessions failed", detail: text.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(text, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return createErrorResponse(error, corsHeaders);
  }
});
