import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";
import { resolveCrawlerServiceBaseUrl } from "../_shared/crawler-route.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isInvalidRouteHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "admin.localhost.run";
  } catch {
    return false;
  }
}

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
    const region = typeof body?.region === "string" ? body.region.slice(0, 40) : "";

    const serviceBaseUrl = resolveCrawlerServiceBaseUrl(null);
    if (!serviceBaseUrl) {
      return new Response(JSON.stringify({ error: "Crawler service disabled" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isInvalidRouteHost(serviceBaseUrl)) {
      return new Response(JSON.stringify({
        error: "Crawler route misconfigured",
        detail: "CRAWLER_SERVICE_BASE_URL points to admin.localhost.run; please use your actual tunnel domain",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceToken = Deno.env.get("CRAWLER_SERVICE_TOKEN") || "";
    const endpoint = `${serviceBaseUrl.replace(/\/$/, "")}/internal/v1/auth/sessions/start`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        platform,
        user_id: user.id,
        region,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Auth session start failed", detail: text.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: Record<string, unknown> = {};
    let parseOk = true;
    try {
      parsed = JSON.parse(text || "{}");
    } catch {
      parseOk = false;
      parsed = {};
    }

    // Normalize different crawler-service payload shapes to one stable contract.
    const payload = (parsed.data && typeof parsed.data === "object")
      ? parsed.data as Record<string, unknown>
      : parsed;
    const qrImage =
      (typeof payload.qr_image_base64 === "string" && payload.qr_image_base64) ||
      (typeof payload.qr_image === "string" && payload.qr_image) ||
      (typeof payload.qr_code_base64 === "string" && payload.qr_code_base64) ||
      (typeof payload.qrCode === "string" && payload.qrCode) ||
      "";

    const normalized = {
      flow_id: String(payload.flow_id || parsed.flow_id || ""),
      platform: String(payload.platform || platform),
      status: String(payload.status || parsed.status || "failed"),
      qr_image_base64: qrImage,
      expires_in: Number(payload.expires_in || parsed.expires_in || 0),
      message: String(payload.message || parsed.message || ""),
      error: payload.error || parsed.error || null,
      route_base: serviceBaseUrl,
      raw: parsed,
    };
    if (!parseOk) {
      normalized.error = `upstream_non_json:${text.trim().slice(0, 200) || "empty"}`;
    } else if (!normalized.flow_id || !normalized.qr_image_base64 || normalized.status !== "pending") {
      normalized.error = String(
        normalized.error ||
        `upstream_invalid_payload:${text.trim().slice(0, 200) || "empty"}`
      );
    }

    return new Response(JSON.stringify(normalized), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return createErrorResponse(error, corsHeaders);
  }
});
