import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const timeoutPromise = new Promise<Response>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`timeout_after_${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([fetch(url, init), timeoutPromise]);
}

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

  let serviceBaseUrl = "";
  try {
    serviceBaseUrl = Deno.env.get("CRAWLER_SERVICE_BASE_URL")?.trim() || "";
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
    const response = await fetchWithTimeout(healthUrl, { method: "GET" }, 8000);
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: false,
          reason: "upstream_error",
          status: response.status,
          latency_ms: latencyMs,
          route_base: serviceBaseUrl,
          message: `Crawler upstream unhealthy: ${response.status} (${serviceBaseUrl})`,
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
          route_base: serviceBaseUrl,
          message: `Crawler health payload is not JSON: ${bodyText.slice(0, 120)} (${serviceBaseUrl})`,
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
          route_base: serviceBaseUrl,
          message: `Crawler health status is not ok: ${JSON.stringify(parsed).slice(0, 160)} (${serviceBaseUrl})`,
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
        route_base: serviceBaseUrl,
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
        route_base: serviceBaseUrl,
        message: `Crawler health check failed: ${(error as Error).message || "unknown"} (${serviceBaseUrl})`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
