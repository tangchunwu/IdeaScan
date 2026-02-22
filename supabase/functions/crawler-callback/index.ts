import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateString, createErrorResponse } from "../_shared/validation.ts";
import { sha256Hex, verifyCrawlerSignature } from "../_shared/crawler-security.ts";
import type { CrawlerResultPayload } from "../_shared/crawler-contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crawler-signature",
};

type CrawlerSampleRow = {
  job_id: string;
  platform: string;
  sample_type: "note" | "comment";
  content_hash: string;
  content: string;
  engagement: number;
  published_at: string | null;
  metadata: Record<string, unknown>;
};

type RawSignalRow = {
  content: string;
  source: string;
  source_id: string;
  source_url: string;
  content_type: string;
  author_name: string;
  likes_count: number;
  comments_count: number;
  content_hash: string;
  scanned_at: string;
  processed_at: string;
};

function readPayload(body: Record<string, unknown>): CrawlerResultPayload {
  if (body.payload && typeof body.payload === "object") {
    return body.payload as CrawlerResultPayload;
  }
  return body as unknown as CrawlerResultPayload;
}

async function buildSampleRows(jobId: string, payload: CrawlerResultPayload): Promise<CrawlerSampleRow[]> {
  const rows: CrawlerSampleRow[] = [];
  for (const platformResult of payload.platform_results || []) {
    const platform = String(platformResult.platform || "unknown");
    for (const note of platformResult.notes || []) {
      const content = `${note.title || ""}\n${note.desc || ""}`.trim();
      if (!content) continue;
      const hashBase = `${jobId}|note|${platform}|${note.id}|${content.slice(0, 120)}`;
      rows.push({
        job_id: jobId,
        platform,
        sample_type: "note",
        content_hash: await sha256Hex(hashBase),
        content,
        engagement: Number(note.liked_count || 0) + Number(note.comments_count || 0),
        published_at: note.published_at || null,
        metadata: {
          note_id: note.id,
          title: note.title || "",
          desc: note.desc || "",
          liked_count: Number(note.liked_count || 0),
          comments_count: Number(note.comments_count || 0),
          collected_count: Number(note.collected_count || 0),
          url: note.url || "",
        },
      });
    }

    for (const comment of platformResult.comments || []) {
      const content = String(comment.content || "").trim();
      if (!content) continue;
      const hashBase = `${jobId}|comment|${platform}|${comment.id}|${content.slice(0, 120)}`;
      rows.push({
        job_id: jobId,
        platform,
        sample_type: "comment",
        content_hash: await sha256Hex(hashBase),
        content,
        engagement: Number(comment.like_count || 0),
        published_at: comment.published_at || null,
        metadata: {
          comment_id: comment.id,
          like_count: Number(comment.like_count || 0),
          user_nickname: comment.user_nickname || "",
          ip_location: comment.ip_location || "",
          parent_id: comment.parent_id || "",
        },
      });
    }
  }
  return rows;
}

function buildRawSignalRows(payload: CrawlerResultPayload): RawSignalRow[] {
  const now = new Date().toISOString();
  const rows: RawSignalRow[] = [];

  for (const platformResult of payload.platform_results || []) {
    const platform = String(platformResult.platform || "unknown");
    for (const note of platformResult.notes || []) {
      const content = `${note.title || ""}\n${note.desc || ""}`.trim();
      if (!content) continue;
      rows.push({
        content,
        source: platform,
        source_id: String(note.id || ""),
        source_url: String(note.url || ""),
        content_type: "post",
        author_name: "",
        likes_count: Number(note.liked_count || 0),
        comments_count: Number(note.comments_count || 0),
        content_hash: `${platform}-note-${note.id}`,
        scanned_at: note.published_at || now,
        processed_at: now,
      });
    }
    for (const comment of platformResult.comments || []) {
      const content = String(comment.content || "").trim();
      if (!content) continue;
      rows.push({
        content,
        source: platform,
        source_id: String(comment.id || ""),
        source_url: "",
        content_type: "comment",
        author_name: String(comment.user_nickname || ""),
        likes_count: Number(comment.like_count || 0),
        comments_count: 0,
        content_hash: `${platform}-comment-${comment.id}`,
        scanned_at: comment.published_at || now,
        processed_at: now,
      });
    }
  }

  return rows;
}

async function updateProviderMetrics(supabase: any, payload: CrawlerResultPayload, qualityScore: number) {
  const day = new Date().toISOString().slice(0, 10);
  const platforms = payload.platform_results || [];
  if (platforms.length === 0) return;

  const avgCostPerProvider = Number(payload.cost?.est_cost || 0) / Math.max(1, platforms.length);

  for (const item of platforms) {
    const provider = String(item.platform || "unknown");
    const success = item.success ? 1 : 0;
    const latency = Number(item.latency_ms || 0);

    const { data: existing } = await supabase
      .from("crawler_provider_metrics_daily")
      .select("total_jobs, success_rate, p95_latency_ms, avg_cost, avg_quality")
      .eq("day", day)
      .eq("provider", provider)
      .maybeSingle();

    const totalJobs = Number(existing?.total_jobs || 0);
    const nextTotal = totalJobs + 1;
    const oldSuccessRate = Number(existing?.success_rate || 0);
    const oldAvgCost = Number(existing?.avg_cost || 0);
    const oldAvgQuality = Number(existing?.avg_quality || 0);

    const nextSuccessRate = ((oldSuccessRate * totalJobs) + success) / nextTotal;
    const nextAvgCost = ((oldAvgCost * totalJobs) + avgCostPerProvider) / nextTotal;
    const nextAvgQuality = ((oldAvgQuality * totalJobs) + qualityScore) / nextTotal;
    const nextP95 = Math.max(Number(existing?.p95_latency_ms || 0), latency);

    await supabase
      .from("crawler_provider_metrics_daily")
      .upsert({
        day,
        provider,
        total_jobs: nextTotal,
        success_rate: Number(nextSuccessRate.toFixed(6)),
        avg_cost: Number(nextAvgCost.toFixed(6)),
        avg_quality: Number(nextAvgQuality.toFixed(3)),
        p95_latency_ms: nextP95,
        updated_at: new Date().toISOString(),
      }, { onConflict: "day,provider" });
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
    const rawBody = await req.text();
    const signature = req.headers.get("X-Crawler-Signature") || "";
    const secret = Deno.env.get("CRAWLER_CALLBACK_SECRET") || "";
    const skipSignature = Deno.env.get("CRAWLER_SKIP_SIGNATURE_VERIFY") === "true";

    if (!skipSignature && secret) {
      const valid = await verifyCrawlerSignature(secret, rawBody, signature);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid callback signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const payload = readPayload(body);
    const jobId = validateString(payload.job_id, "job_id", 64, true)!;
    const status = validateString(payload.status, "status", 32, true)!;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: job, error: jobError } = await supabase
      .from("crawler_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qualityScore = Number(payload.quality?.freshness_score || 0);
    await supabase
      .from("crawler_jobs")
      .update({
        status,
        result_payload: payload,
        quality_score: qualityScore,
        cost_breakdown: payload.cost || {},
        error: Array.isArray(payload.errors) ? payload.errors.join("; ").slice(0, 500) : null,
      })
      .eq("id", jobId);

    if (status === "completed") {
      const samples = await buildSampleRows(jobId, payload);
      if (samples.length > 0) {
        await supabase
          .from("crawler_samples")
          .upsert(samples, { onConflict: "job_id,content_hash", ignoreDuplicates: true });
      }

      const rawSignals = buildRawSignalRows(payload);
      if (rawSignals.length > 0) {
        await supabase
          .from("raw_market_signals")
          .upsert(rawSignals, { onConflict: "content_hash", ignoreDuplicates: true });
      }

      await updateProviderMetrics(supabase, payload, qualityScore);
    }

    return new Response(JSON.stringify({ success: true, job_id: jobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return createErrorResponse(error, corsHeaders);
  }
});
