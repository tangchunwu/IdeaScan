import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkLeadRateLimit,
  getClientIp,
  isValidEmail,
} from "../_shared/lead-rate-limit.ts";
import { computeProofRates } from "../_shared/proof-experiment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
]);

function buildRiskFlags(email: string): string[] {
  const flags: string[] = [];
  const [, domain = ""] = email.split("@");
  if (DISPOSABLE_DOMAINS.has(domain.toLowerCase())) flags.push("disposable_domain");
  if (/\+\w+@/.test(email)) flags.push("plus_alias");
  return flags;
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
    const landingPageId = typeof body?.landingPageId === "string" ? body.landingPageId : "";
    const emailRaw = typeof body?.email === "string" ? body.email : "";
    const anonId = typeof body?.anonId === "string" ? body.anonId.slice(0, 120) : null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 120) : null;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!landingPageId) {
      return new Response(JSON.stringify({ error: "landingPageId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = emailRaw.toLowerCase().trim();
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = getClientIp(req);
    const rateLimit = checkLeadRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many submissions. Please try again later.",
          resetIn: rateLimit.resetIn,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: page } = await supabase
      .from("mvp_landing_pages")
      .select("id, user_id, validation_id, is_published")
      .eq("id", landingPageId)
      .eq("is_published", true)
      .maybeSingle();

    if (!page) {
      return new Response(JSON.stringify({ error: "Landing page not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingLead } = await supabase
      .from("mvp_leads")
      .select("id")
      .eq("landing_page_id", landingPageId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    const riskFlags = buildRiskFlags(email);

    if (!existingLead) {
      const { error: insertError } = await supabase
        .from("mvp_leads")
        .insert({
          landing_page_id: landingPageId,
          email,
          metadata: {
            ...metadata,
            source: "public_landing_page",
            client_ip: clientIp,
            user_agent: (req.headers.get("user-agent") || "").slice(0, 240),
            risk_flags: riskFlags,
            anon_id: anonId,
          },
        });

      if (insertError) {
        if (insertError.message?.includes("duplicate")) {
          // idempotent success for repeated submits
        } else {
          throw insertError;
        }
      }
    }

    let experiment = await supabase
      .from("demand_experiments")
      .select("id, cta_type, validation_id, uv_count, paid_intent_count, waitlist_submit_count")
      .eq("landing_page_id", landingPageId)
      .maybeSingle();

    if (!experiment.data) {
      let idea = "MVP Experiment";
      if (page.validation_id) {
        const { data: validation } = await supabase
          .from("validations")
          .select("idea")
          .eq("id", page.validation_id)
          .maybeSingle();
        idea = validation?.idea || idea;
      }

      const { data: createdExp, error: createExpError } = await supabase
        .from("demand_experiments")
        .insert({
          user_id: page.user_id,
          validation_id: page.validation_id,
          landing_page_id: landingPageId,
          idea,
          status: "running",
          cta_type: "paid_intent",
          cta_label: "Reserve Early Access",
        })
        .select("id, cta_type, validation_id, uv_count, paid_intent_count, waitlist_submit_count")
        .single();

      if (createExpError) throw createExpError;
      experiment = { data: createdExp, error: null };
    }

    const exp = experiment.data!;
    if (!existingLead) {
      const eventTypes = ["waitlist_submit"] as string[];
      if (exp.cta_type === "paid_intent") {
        eventTypes.push("paid_intent");
      }

      for (const eventType of eventTypes) {
        await supabase.from("experiment_events").insert({
          experiment_id: exp.id,
          event_type: eventType,
          metadata: {
            source: "lead_submit",
            landing_page_id: landingPageId,
            deduped: false,
          },
          anon_id: anonId || `ip:${clientIp}`,
          session_id: sessionId,
        });
      }
    }

    const counters = {
      uv_count: Number(exp.uv_count || 0),
      cta_click_count: 0,
      checkout_start_count: 0,
      paid_intent_count: Number(exp.paid_intent_count || 0) + (exp.cta_type === "paid_intent" && !existingLead ? 1 : 0),
      waitlist_submit_count: Number(exp.waitlist_submit_count || 0) + (!existingLead ? 1 : 0),
    };

    const rates = computeProofRates(counters);

    await supabase
      .from("demand_experiments")
      .update({
        paid_intent_count: counters.paid_intent_count,
        waitlist_submit_count: counters.waitlist_submit_count,
        paid_intent_rate: rates.paid_intent_rate,
        waitlist_rate: rates.waitlist_rate,
        evidence_verdict: rates.evidence_verdict,
        updated_at: new Date().toISOString(),
      })
      .eq("id", exp.id);

    await supabase
      .from("idea_proof_snapshots")
      .upsert({
        experiment_id: exp.id,
        snapshot_date: new Date().toISOString().slice(0, 10),
        uv_count: counters.uv_count,
        paid_intent_count: counters.paid_intent_count,
        waitlist_submit_count: counters.waitlist_submit_count,
        paid_intent_rate: rates.paid_intent_rate,
        waitlist_rate: rates.waitlist_rate,
        evidence_verdict: rates.evidence_verdict,
      }, { onConflict: "experiment_id,snapshot_date" });

    if (exp.validation_id) {
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
        .eq("validation_id", exp.validation_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        duplicate: !!existingLead,
        rateLimitRemaining: rateLimit.remaining,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
