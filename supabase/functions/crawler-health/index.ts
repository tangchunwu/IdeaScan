import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceBaseUrl = Deno.env.get("CRAWLER_SERVICE_BASE_URL")?.trim() || "";
    if (!serviceBaseUrl) {
      return new Response(
        JSON.stringify({
          enabled: false,
          healthy: false,
          reason: "disabled",
          message: "Crawler service disabled",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (isInvalidRouteHost(serviceBaseUrl)) {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: false,
          reason: "misconfigured_route",
          message: "CRAWLER_SERVICE_BASE_URL is admin.localhost.run; please use real crawler tunnel domain",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const healthUrl = `${serviceBaseUrl.replace(/\/$/, "")}/health`;
    const startedAt = Date.now();
    const response = await fetch(healthUrl, { method: "GET" });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: false,
          reason: "upstream_error",
          status: response.status,
          latency_ms: latencyMs,
          message: `Crawler upstream unhealthy: ${response.status}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bodyText = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText || "{}");
    } catch {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: false,
          reason: "invalid_health_response",
          latency_ms: latencyMs,
          message: `Crawler health payload is not JSON: ${bodyText.slice(0, 120)}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (String(parsed.status || "").toLowerCase() !== "ok") {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: false,
          reason: "invalid_health_status",
          latency_ms: latencyMs,
          message: `Crawler health status is not ok: ${JSON.stringify(parsed).slice(0, 160)}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        enabled: true,
        healthy: true,
        reason: "ok",
        latency_ms: latencyMs,
        message: "Crawler service healthy",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        enabled: true,
        healthy: false,
        reason: "exception",
        message: `Crawler health check failed: ${(error as Error).message || "unknown"}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
