import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      throw new ValidationError("Invalid or expired session");
    }

    const body = await req.json();
    const platform = body?.platform === "douyin" ? "douyin" : "xiaohongshu";
    const cookies = Array.isArray(body?.cookies) ? body.cookies : [];
    const region = typeof body?.region === "string" ? body.region.slice(0, 40) : "";
    if (!cookies.length) throw new ValidationError("cookies is required");

    const serviceBaseUrl = Deno.env.get("CRAWLER_SERVICE_BASE_URL");
    if (!serviceBaseUrl) {
      return new Response(JSON.stringify({ error: "Crawler service disabled" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceToken = Deno.env.get("CRAWLER_SERVICE_TOKEN") || "";
    const endpoint = `${serviceBaseUrl.replace(/\/$/, "")}/internal/v1/auth/sessions/import`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        platform,
        user_id: user.id,
        cookies,
        region,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Import cookies failed", detail: text.slice(0, 500) }), {
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

