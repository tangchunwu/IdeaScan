import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeProofRates,
  type ExperimentEventType,
} from "../_shared/proof-experiment.ts";
import { getClientIp } from "../_shared/lead-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_EVENTS = new Set<ExperimentEventType>([
  "view",
  "cta_click",
  "checkout_start",
  "paid_intent",
  "waitlist_submit",
]);

function toAnonId(input: unknown, req: Request): string {
  const v = typeof input === "string" ? input.trim() : "";
  if (v) return v.slice(0, 120);
  const clientIp = getClientIp(req);
  const ua = req.headers.get("user-agent") || "unknown";
  return `ip:${clientIp}|ua:${ua.slice(0, 80)}`;
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
    const body = await req.json();
    const eventType = body?.eventType as ExperimentEventType;
    const landingPageId = typeof body?.landingPageId === "string" ? body.landingPageId : null;
    const experimentIdInput = typeof body?.experimentId === "string" ? body.experimentId : null;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 120) : null;
    const anonId = toAnonId(body?.anonId, req);

    if (!VALID_EVENTS.has(eventType)) {
      return new Response(JSON.stringify({ error: "Invalid eventType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userRes } = await supabase.auth.getUser(token);
      userId = userRes.user?.id ?? null;
    }

    let experimentQuery = supabase
      .from("demand_experiments")
      .select("id, validation_id, uv_count, cta_click_count, checkout_start_count, paid_intent_count, waitlist_submit_count");

    if (experimentIdInput) {
      experimentQuery = experimentQuery.eq("id", experimentIdInput);
    } else if (landingPageId) {
      experimentQuery = experimentQuery.eq("landing_page_id", landingPageId);
    } else {
      return new Response(JSON.stringify({ error: "experimentId or landingPageId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { data: experiment, error: expError } = await experimentQuery.single();
    if ((expError || !experiment) && landingPageId) {
      const { data: page } = await supabase
        .from("mvp_landing_pages")
        .select("id, user_id, validation_id")
        .eq("id", landingPageId)
        .maybeSingle();

      if (page) {
        let idea = "MVP Experiment";
        if (page.validation_id) {
          const { data: validation } = await supabase
            .from("validations")
            .select("idea")
            .eq("id", page.validation_id)
            .maybeSingle();
          idea = validation?.idea || idea;
        }

        const { data: created } = await supabase
          .from("demand_experiments")
          .insert({
            user_id: page.user_id,
            validation_id: page.validation_id,
            landing_page_id: page.id,
            idea,
            status: "running",
            cta_type: "paid_intent",
            cta_label: "Reserve Early Access",
          })
          .select("id, validation_id, uv_count, cta_click_count, checkout_start_count, paid_intent_count, waitlist_submit_count")
          .single();
        experiment = created as any;
      }
    }

    if (!experiment) {
      return new Response(JSON.stringify({ error: "Experiment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let shouldCount = true;
    if (eventType === "view") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: dupView } = await supabase
        .from("experiment_events")
        .select("id")
        .eq("experiment_id", experiment.id)
        .eq("event_type", "view")
        .eq("anon_id", anonId)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      shouldCount = !dupView;
    }

    await supabase.from("experiment_events").insert({
      experiment_id: experiment.id,
      event_type: eventType,
      metadata,
      session_id: sessionId,
      anon_id: anonId,
      user_id: userId,
    });

    const counters = {
      uv_count: Number(experiment.uv_count || 0),
      cta_click_count: Number(experiment.cta_click_count || 0),
      checkout_start_count: Number(experiment.checkout_start_count || 0),
      paid_intent_count: Number(experiment.paid_intent_count || 0),
      waitlist_submit_count: Number(experiment.waitlist_submit_count || 0),
    };

    if (shouldCount) {
      if (eventType === "view") counters.uv_count += 1;
      if (eventType === "cta_click") counters.cta_click_count += 1;
      if (eventType === "checkout_start") counters.checkout_start_count += 1;
      if (eventType === "paid_intent") counters.paid_intent_count += 1;
      if (eventType === "waitlist_submit") counters.waitlist_submit_count += 1;
    }

    const rates = computeProofRates(counters);

    await supabase
      .from("demand_experiments")
      .update({
        ...counters,
        ...rates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", experiment.id);

    await supabase
      .from("idea_proof_snapshots")
      .upsert({
        experiment_id: experiment.id,
        snapshot_date: new Date().toISOString().slice(0, 10),
        uv_count: counters.uv_count,
        paid_intent_count: counters.paid_intent_count,
        waitlist_submit_count: counters.waitlist_submit_count,
        paid_intent_rate: rates.paid_intent_rate,
        waitlist_rate: rates.waitlist_rate,
        evidence_verdict: rates.evidence_verdict,
      }, { onConflict: "experiment_id,snapshot_date" });

    if (experiment.validation_id) {
      await supabase
        .from("validation_reports")
        .update({
          proof_result: {
            paid_intent_rate: rates.paid_intent_rate,
            waitlist_rate: rates.waitlist_rate,
            sample_uv: counters.uv_count,
            verdict: rates.evidence_verdict,
          },
        })
        .eq("validation_id", experiment.validation_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        counted: shouldCount,
        experimentId: experiment.id,
        proof: {
          paid_intent_rate: rates.paid_intent_rate,
          waitlist_rate: rates.waitlist_rate,
          sample_uv: counters.uv_count,
          verdict: rates.evidence_verdict,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
