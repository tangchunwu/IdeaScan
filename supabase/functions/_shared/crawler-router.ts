import {
  buildCrawlerLimits,
  buildTraceId,
  normalizeCrawlerPlatforms,
  normalizeCrawlerResultToSocialData,
  type CrawlerMode,
  type CrawlerResultPayload,
  type RoutedSocialData,
} from "./crawler-contract.ts";
import { hmacSha256Hex } from "./crawler-security.ts";

interface DispatchCrawlerOptions {
  supabase: any;
  validationId: string;
  userId: string;
  query: string;
  mode: CrawlerMode;
  enableXiaohongshu: boolean;
  enableDouyin: boolean;
  source?: string;
  freshnessDays?: number;
  timeoutMs?: number;
}

interface DispatchCrawlerResult {
  jobId: string;
  dispatched: boolean;
  externalJobId?: string;
  error?: string;
}

interface PollCrawlerResult {
  status: string;
  payload: CrawlerResultPayload | null;
  qualityScore: number;
  costBreakdown: Record<string, unknown>;
}

interface RouteCrawlerResult {
  socialData: RoutedSocialData | null;
  costBreakdown: Record<string, unknown>;
  qualityScore: number;
  usedCrawlerService: boolean;
  error?: string;
  diagnostic?: string;
}

interface CrawlerServiceSnapshot {
  status: string;
  payload: CrawlerResultPayload | null;
  error?: string;
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function readJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseCrawlerResultPayload(value: unknown): CrawlerResultPayload | null {
  const parsed = readJson(value);
  const jobId = typeof parsed.job_id === "string" ? parsed.job_id : "";
  const status = typeof parsed.status === "string" ? parsed.status : "";
  if (!jobId || !status) return null;
  return parsed as unknown as CrawlerResultPayload;
}

function extractCrawlerFailureDiagnostic(payload: CrawlerResultPayload | null): string {
  if (!payload) return "";
  const reasons: string[] = [];

  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (typeof item === "string" && item.trim()) reasons.push(item.trim());
    }
  }

  if (Array.isArray(payload.platform_results)) {
    for (const item of payload.platform_results as Array<Record<string, unknown>>) {
      const ok = Boolean(item?.success);
      const platform = String(item?.platform || "unknown");
      const err = String(item?.error || "").trim();
      if (!ok && err) reasons.push(`${platform}:${err}`);
    }
  }

  if (reasons.length <= 0) return "";
  const joined = reasons.join("; ");
  return joined.slice(0, 500);
}

async function fetchCrawlerServiceSnapshot(jobId: string): Promise<CrawlerServiceSnapshot | null> {
  const serviceBaseUrl = (Deno.env.get("CRAWLER_SERVICE_BASE_URL") || "").trim();
  if (!serviceBaseUrl) return null;

  const serviceToken = Deno.env.get("CRAWLER_SERVICE_TOKEN") || "";
  const endpoint = `${serviceBaseUrl.replace(/\/$/, "")}/internal/v1/crawl/jobs/${jobId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
    });
    const text = await response.text();
    const body = readJson(text);

    if (!response.ok) {
      return {
        status: "unknown",
        payload: null,
        error: `crawler_service_status_${response.status}:${text.slice(0, 240)}`,
      };
    }

    const status = String(body.status || "unknown");
    const payload = parseCrawlerResultPayload(body.result_payload)
      || parseCrawlerResultPayload(body.result)
      || parseCrawlerResultPayload(body.payload);

    return { status, payload, error: typeof body.callback_error === "string" ? body.callback_error : undefined };
  } catch (error) {
    return {
      status: "unknown",
      payload: null,
      error: error instanceof Error ? error.message : "crawler_service_status_exception",
    };
  }
}

async function replayCrawlerCallback(payload: CrawlerResultPayload): Promise<boolean> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
  if (!supabaseUrl) return false;

  const callbackSecret = Deno.env.get("CRAWLER_CALLBACK_SECRET") || "";
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/crawler-callback`;
  const body = JSON.stringify(payload);
  const signature = callbackSecret ? await hmacSha256Hex(callbackSecret, body) : "";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "X-Crawler-Signature": signature } : {}),
      },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function writeFallbackJobResult(
  supabase: any,
  jobId: string,
  status: string,
  payload: CrawlerResultPayload | null,
  fallbackError?: string
) {
  const terminalStatus = isTerminalStatus(status) ? status : "failed";
  const qualityScore = Number(payload?.quality?.freshness_score || 0);
  const payloadErrors = Array.isArray(payload?.errors) ? payload?.errors.join("; ") : "";
  const errorText = (payloadErrors || fallbackError || "").slice(0, 500) || null;

  await supabase
    .from("crawler_jobs")
    .update({
      status: terminalStatus,
      result_payload: payload || {},
      quality_score: qualityScore,
      cost_breakdown: readJson(payload?.cost),
      error: errorText,
    })
    .eq("id", jobId);
}

export async function dispatchCrawlerJob(options: DispatchCrawlerOptions): Promise<DispatchCrawlerResult | null> {
  const {
    supabase,
    validationId,
    userId,
    query,
    mode,
    enableXiaohongshu,
    enableDouyin,
    source = "self_crawler",
    freshnessDays = 14,
    timeoutMs = 12000,
  } = options;

  const serviceBaseUrl = Deno.env.get("CRAWLER_SERVICE_BASE_URL");
  if (!serviceBaseUrl) {
    return null;
  }

  const platforms = normalizeCrawlerPlatforms(enableXiaohongshu, enableDouyin);
  if (platforms.length === 0) {
    return null;
  }

  const requestPayload = {
    validation_id: validationId,
    trace_id: buildTraceId("crawler", validationId, userId),
    user_id: userId,
    query,
    platforms,
    mode,
    limits: buildCrawlerLimits(mode),
    freshness_days: freshnessDays,
    timeout_ms: timeoutMs,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("crawler_jobs")
    .insert({
      validation_id: validationId,
      trace_id: requestPayload.trace_id,
      source,
      platforms,
      query,
      status: "queued",
      request_payload: requestPayload,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return {
      jobId: "",
      dispatched: false,
      error: insertError?.message || "failed_to_create_job",
    };
  }

  const jobId = String(inserted.id);
  const callbackUrl = Deno.env.get("CRAWLER_CALLBACK_URL")
    || `${Deno.env.get("SUPABASE_URL")}/functions/v1/crawler-callback`;
  const serviceToken = Deno.env.get("CRAWLER_SERVICE_TOKEN") || "";
  const callbackSecret = Deno.env.get("CRAWLER_CALLBACK_SECRET") || "";

  try {
    const endpoint = `${serviceBaseUrl.replace(/\/$/, "")}/internal/v1/crawl/jobs`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        job_id: jobId,
        callback_url: callbackUrl,
        callback_secret: callbackSecret,
        payload: requestPayload,
      }),
    });

    const responseText = await response.text();
    let responseJson: Record<string, unknown> = {};
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = {};
    }

    if (!response.ok) {
      await supabase
        .from("crawler_jobs")
        .update({
          status: "failed",
          error: responseText.slice(0, 500),
          attempt: 1,
        })
        .eq("id", jobId);
      return {
        jobId,
        dispatched: false,
        error: `dispatch_failed_${response.status}`,
      };
    }

    const externalJobId = String(responseJson.job_id || jobId);
    await supabase
      .from("crawler_jobs")
      .update({
        status: "dispatched",
        external_job_id: externalJobId,
        attempt: 1,
      })
      .eq("id", jobId);

    return {
      jobId,
      dispatched: true,
      externalJobId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "dispatch_exception";
    await supabase
      .from("crawler_jobs")
      .update({ status: "failed", error: message.slice(0, 500), attempt: 1 })
      .eq("id", jobId);
    return {
      jobId,
      dispatched: false,
      error: message,
    };
  }
}

export async function pollCrawlerJobResult(
  supabase: any,
  jobId: string,
  timeoutMs = 25000,
  intervalMs = 900
): Promise<PollCrawlerResult> {
  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    const { data, error } = await supabase
      .from("crawler_jobs")
      .select("status, result_payload, quality_score, cost_breakdown")
      .eq("id", jobId)
      .single();

    if (!error && data) {
      const status = String(data.status || "queued");
      if (isTerminalStatus(status)) {
        return {
          status,
          payload: (readJson(data.result_payload) as unknown as CrawlerResultPayload) || null,
          qualityScore: Number(data.quality_score || 0),
          costBreakdown: readJson(data.cost_breakdown),
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Callback may fail while crawler service already has terminal result.
  // Fallback: pull snapshot from crawler service and replay callback to self-heal Supabase state.
  const snapshot = await fetchCrawlerServiceSnapshot(jobId);
  if (snapshot) {
    if (isTerminalStatus(snapshot.status) && snapshot.payload) {
      const replayed = await replayCrawlerCallback(snapshot.payload);
      if (!replayed) {
        await writeFallbackJobResult(supabase, jobId, snapshot.status, snapshot.payload, snapshot.error || "callback_replay_failed");
      }
      return {
        status: snapshot.status,
        payload: snapshot.payload,
        qualityScore: Number(snapshot.payload.quality?.freshness_score || 0),
        costBreakdown: readJson(snapshot.payload.cost),
      };
    }

    if (isTerminalStatus(snapshot.status)) {
      await writeFallbackJobResult(supabase, jobId, snapshot.status, null, snapshot.error || "crawler_terminal_without_payload");
      return {
        status: snapshot.status,
        payload: null,
        qualityScore: 0,
        costBreakdown: {},
      };
    }
  }

  await supabase
    .from("crawler_jobs")
    .update({ status: "failed", error: "crawler_callback_timeout" })
    .eq("id", jobId)
    .in("status", ["queued", "dispatched", "running"]);

  return {
    status: "timeout",
    payload: null,
    qualityScore: 0,
    costBreakdown: {},
  };
}

export async function routeCrawlerSource(options: DispatchCrawlerOptions): Promise<RouteCrawlerResult> {
  const dispatchResult = await dispatchCrawlerJob(options);
  if (!dispatchResult?.dispatched || !dispatchResult.jobId) {
    return {
      socialData: null,
      costBreakdown: {},
      qualityScore: 0,
      usedCrawlerService: false,
      error: dispatchResult?.error || "crawler_service_disabled",
    };
  }

  const polled = await pollCrawlerJobResult(options.supabase, dispatchResult.jobId, options.timeoutMs || 25000);
  if (polled.status !== "completed" || !polled.payload) {
    const diagnostic = extractCrawlerFailureDiagnostic(polled.payload);
    return {
      socialData: null,
      costBreakdown: polled.costBreakdown,
      qualityScore: polled.qualityScore,
      usedCrawlerService: true,
      error: polled.status,
      diagnostic: diagnostic || undefined,
    };
  }

  return {
    socialData: normalizeCrawlerResultToSocialData(polled.payload),
    costBreakdown: polled.costBreakdown,
    qualityScore: polled.qualityScore,
    usedCrawlerService: true,
  };
}
