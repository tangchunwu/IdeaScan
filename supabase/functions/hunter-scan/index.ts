import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MarketSignal {
  summary: string;
  source_url: string;
  topic_tags: string[];
  opportunity_score: number;
  pain_level: string;
  sentiment: string;
  trend_direction?: string;
}

const VALID_PAIN_LEVELS = new Set(["mild", "moderate", "severe", "critical"]);
function normalizePainLevel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (VALID_PAIN_LEVELS.has(lower)) return lower;
  const map: Record<string, string> = { high: "severe", low: "mild", medium: "moderate", extreme: "critical", very_high: "critical", none: "mild" };
  return map[lower] || "moderate";
}

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * 构建纯趋势发现 prompt — 无需关键词，直接全网探索
 */
function buildTrendDiscoveryPrompt(): string {
  return `请作为一位顶级市场趋势分析师，深度分析当前全球和中国市场最值得关注的创业机会和用户痛点。

请从以下维度进行全面扫描：

1. **爆发增长的新兴赛道**：过去 1-2 周内在社交媒体（小红书、Reddit、知乎、Twitter/X、抖音）上讨论量激增的话题或产品方向
2. **用户痛点集中爆发区**：大量用户正在抱怨但市场上缺乏好的解决方案的领域
3. **供需严重错配的市场**：用户愿意付费但找不到好产品/服务的细分领域
4. **技术驱动的新机会**：AI、区块链、硬件等新技术催生的应用场景和创业方向
5. **跨境/跨平台套利机会**：在某个市场验证成功、但尚未进入其他市场的模式

请尽量引用真实的数据和案例（如：搜索量变化、帖子讨论量、具体的用户评论等）。

请返回 JSON 格式数组，包含 8-12 条市场信号。每条信号包含：
- summary: 趋势/机会的深度描述（2-3句话，包含具体数据或案例）
- source_url: 信息来源URL（如果有）
- topic_tags: 3-5个话题标签
- opportunity_score: 商机评分（0-100，越高越值得关注）
- pain_level: 痛点等级（"mild"/"moderate"/"severe"/"critical"）
- sentiment: 市场情绪（"negative"/"neutral"/"mixed"/"positive"）
- trend_direction: 趋势方向（"rising"/"emerging"/"declining"/"stable"）

只返回 JSON 数组，不要其他文字。`;
}

/**
 * 构建语义化查询 prompt — 支持关键词和自然语言描述
 */
function buildSemanticPrompt(input: string, isDescription: boolean): string {
  if (isDescription) {
    return `${input}

请从社交媒体（小红书、Reddit、知乎、微博、抖音评论区）、论坛、行业报告等渠道深入调研。
重点关注：
1. 真实用户的具体抱怨和不满（尽量引用原话或场景）
2. 用户愿意为什么付费？有没有"付费意愿强但供给不足"的需求？
3. 现有方案的明显短板
4. 未被充分服务的细分市场

请返回 JSON 格式，包含 5-8 条市场信号。每条信号包含：
- summary: 痛点或需求的简洁描述（1-2句话，尽量引用具体场景）
- source_url: 来源URL（如果有）
- topic_tags: 2-3个话题标签
- opportunity_score: 商机评分（0-100，越高越有商业价值）
- pain_level: 痛点等级（"mild"/"moderate"/"severe"/"critical"）
- sentiment: 情感倾向（"negative"/"neutral"/"mixed"）

只返回 JSON 数组，不要其他文字。`;
  }

  const angles = [
    `关于"${input}"这个领域，用户最近在社交媒体上最常抱怨什么？有哪些产品或服务让他们非常不满意？他们愿意为什么解决方案付费？请提取具体的用户痛点场景。`,
    `从创业机会的角度分析"${input}"：有哪些新兴的、未被充分服务的细分市场？现有头部玩家有什么明显短板？有没有可以用低成本验证的小众切入点？`,
  ];
  const selected = angles[Math.floor(Math.random() * angles.length)];

  return `${selected}

从社交媒体（小红书、Reddit、知乎、微博）、论坛、行业报告等渠道汇总。

请返回 JSON 格式，包含 5-8 条市场信号。每条信号包含：
- summary: 痛点或需求的简洁描述（1-2句话，尽量引用具体场景）
- source_url: 来源URL（如果有）
- topic_tags: 2-3个话题标签
- opportunity_score: 商机评分（0-100，越高越有商业价值）
- pain_level: 痛点等级（"mild"/"moderate"/"severe"/"critical"）
- sentiment: 情感倾向（"negative"/"neutral"/"mixed"）

只返回 JSON 数组，不要其他文字。`;
}

/**
 * 从内容中剥离 <think>...</think> 推理标签（sonar-reasoning 模型会返回）
 */
function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function searchWithPerplexity(
  input: string,
  baseUrl: string,
  apiKey: string,
  options: { isDescription?: boolean; model?: string; isDiscovery?: boolean } = {}
): Promise<{ signals: MarketSignal[]; citations: string[] }> {
  const defaultModel = Deno.env.get("PERPLEXITY_MODEL") || "sonar";
  const { isDescription = false, model = defaultModel, isDiscovery = false } = options;

  const prompt = isDiscovery ? buildTrendDiscoveryPrompt() : buildSemanticPrompt(input, isDescription);
  const systemContent = isDiscovery
    ? "你是一位世界级的市场趋势猎手和商机分析师。你的工作是从全网海量信息中识别出最具商业价值的趋势和机会。你的分析必须基于真实数据和案例，不允许编造。只返回有效的 JSON 数组。"
    : "你是一位资深市场情报分析师，擅长从公开网络信息中挖掘深层用户痛点和未被满足的需求。你的分析要具体、有洞察力，避免泛泛而谈。只返回有效的 JSON 数组。";

  const endpoint = `${baseUrl}/chat/completions`;
  console.log(`[hunter-scan] Calling: ${endpoint} model=${model}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Perplexity API error: ${response.status}`, text);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = (data as any).sources?.map((s: any) => s.url || s) ?? (data as any).citations ?? [];

  // Strip <think> tags from reasoning models
  content = stripThinkTags(content);

  let signals: MarketSignal[] = [];
  try {
    // Remove citation markers like [1], [1][7], [1,7] that Perplexity injects
    const cleaned = content.replace(/\[(\d+(?:,\s*\d+)*)\]/g, "").replace(/\s+/g, " ");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      signals = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse Perplexity response as JSON:", e);
    console.log("Raw content (first 500):", content.slice(0, 500));
  }

  if (citations.length > 0) {
    signals.forEach((s, i) => {
      if (!s.source_url && citations[i]) {
        s.source_url = typeof citations[i] === "string" ? citations[i] : "";
      }
    });
  }

  return { signals, citations };
}

function buildRecordsFromSignals(signals: MarketSignal[]): any[] {
  const records: any[] = [];
  const hashPromises: Promise<void>[] = [];

  for (const signal of signals) {
    if (!signal.summary || signal.summary.length < 10) continue;
    const record: any = {
      content: signal.summary,
      source: "perplexity",
      source_url: signal.source_url || null,
      content_type: "intelligence",
      author_name: null,
      likes_count: 0,
      comments_count: 0,
      content_hash: "", // filled async
      topic_tags: signal.topic_tags || [],
      pain_level: normalizePainLevel(signal.pain_level),
      opportunity_score: Math.min(100, Math.max(0, signal.opportunity_score || 0)),
      sentiment_score: signal.sentiment === "negative" ? -0.5 : signal.sentiment === "mixed" ? 0 : 0.3,
      processed_at: new Date().toISOString(),
      scanned_at: new Date().toISOString(),
    };
    // Encode trend_direction into topic_tags if present
    if (signal.trend_direction) {
      record.topic_tags = [...(record.topic_tags || []), `trend:${signal.trend_direction}`];
    }
    records.push(record);
    hashPromises.push(
      hashContent(signal.summary).then(h => { record.content_hash = h; })
    );
  }

  return records;
}

async function fillHashes(records: any[], signals: MarketSignal[]): Promise<void> {
  await Promise.all(
    records.map((r, i) => hashContent(signals.filter(s => s.summary && s.summary.length >= 10)[i]?.summary || r.content).then(h => { r.content_hash = h; }))
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { resolveConfigs: rc } = await import("../_shared/config-resolver.ts");
    const resolved = await rc(["PERPLEXITY_BASE_URL", "PERPLEXITY_API_KEY", "PERPLEXITY_MODEL"]);
    const baseUrl = resolved["PERPLEXITY_BASE_URL"];
    const apiKey = resolved["PERPLEXITY_API_KEY"];
    if (!baseUrl || !apiKey) {
      throw new Error("PERPLEXITY_BASE_URL or PERPLEXITY_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Accept keywords + optional description + optional mode from body
    let keywords: string[] = [];
    let description = "";
    let mode = "";
    try {
      const body = await req.json();
      keywords = body.keywords || [];
      description = body.description || "";
      mode = body.mode || "";
    } catch { /* no body */ }

    const hasDescription = description.trim().length > 0;
    const isDiscoverMode = mode === "discover";

    // --- 配额保护 ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from("raw_market_signals")
      .select("id", { count: "exact", head: true })
      .eq("source", "perplexity")
      .gte("scanned_at", todayStart.toISOString());

    const DAILY_LIMIT = 100;
    const dailyUsed = todayCount || 0;
    if (dailyUsed >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ success: true, message: `Daily quota exhausted (${dailyUsed}/${DAILY_LIMIT})`, signals_inserted: 0, quota_exhausted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalInserted = 0;
    const errors: string[] = [];

    // === 趋势发现模式：无关键词直接全网探索 ===
    if (isDiscoverMode || (keywords.length === 0 && !hasDescription)) {
      // Check if there are active scan_jobs (only when not explicitly in discover mode)
      if (!isDiscoverMode && keywords.length === 0 && !hasDescription) {
        const { data: jobs } = await supabase
          .from("scan_jobs")
          .select("id, keywords")
          .eq("status", "active")
          .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);
        if (jobs && jobs.length > 0) {
          keywords = [...new Set(jobs.flatMap((j: any) => j.keywords))];
        }
      }

      // If still no keywords (or explicit discover mode), do trend discovery
      if (isDiscoverMode || keywords.length === 0) {
        console.log(`[hunter-scan] 🔍 Trend discovery mode — using ${Deno.env.get("PERPLEXITY_MODEL") || "sonar"}`);
        try {
          const { signals } = await searchWithPerplexity("", baseUrl, apiKey, {
            isDiscovery: true,
          });
          console.log(`[hunter-scan] Trend discovery got ${signals.length} signals`);

          const records = buildRecordsFromSignals(signals);
          await Promise.all(records.map(r => hashContent(r.content).then(h => { r.content_hash = h; })));

          if (records.length > 0) {
            const { data: inserted, error: insertError } = await supabase
              .from("raw_market_signals").insert(records).select("id");
            if (insertError) {
              console.error(`[hunter-scan] Insert error:`, insertError.message);
            } else {
              totalInserted += inserted?.length || 0;
            }
          }
        } catch (e) {
          errors.push(`discover: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Update scan_jobs then auto-trigger signal-processor
        await updateScanJobs(supabase, totalInserted);
        if (totalInserted > 0) {
          await triggerSignalProcessor(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
        }

        return new Response(
          JSON.stringify({
            success: true,
            mode: "discover",
            signals_inserted: totalInserted,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- 24h 关键词去重 ---
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from("raw_market_signals")
      .select("topic_tags")
      .eq("source", "perplexity")
      .gte("scanned_at", since24h);

    const recentKeywords = new Set<string>();
    for (const row of recentSignals || []) {
      for (const tag of (row as any).topic_tags || []) {
        recentKeywords.add(tag.toLowerCase());
      }
    }

    // Process description as a single semantic query if provided
    if (hasDescription) {
      console.log(`[hunter-scan] Scanning with semantic description: "${description.slice(0, 80)}..."`);
      try {
        const { signals } = await searchWithPerplexity(description, baseUrl, apiKey, { isDescription: true });
        console.log(`[hunter-scan] Semantic query got ${signals.length} signals`);
        const records = buildRecordsFromSignals(signals);
        await Promise.all(records.map(r => hashContent(r.content).then(h => { r.content_hash = h; })));
        if (records.length > 0) {
          const { data: inserted, error: insertError } = await supabase
            .from("raw_market_signals").insert(records).select("id");
          if (insertError) {
            console.error(`[hunter-scan] Insert error:`, insertError.message);
          } else {
            totalInserted += inserted?.length || 0;
          }
        }
      } catch (e) {
        errors.push(`description: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Process keywords
    const freshKeywords = keywords.filter((kw: string) => !recentKeywords.has(kw.toLowerCase()));
    const keywordsToScan = freshKeywords.length > 0 ? freshKeywords : keywords;

    for (const keyword of keywordsToScan.slice(0, 5)) {
      try {
        const { signals } = await searchWithPerplexity(keyword, baseUrl, apiKey);
        console.log(`[hunter-scan] "${keyword}": got ${signals.length} signals`);
        const records = buildRecordsFromSignals(signals);
        await Promise.all(records.map(r => hashContent(r.content).then(h => { r.content_hash = h; })));
        if (records.length > 0) {
          const { data: inserted, error: insertError } = await supabase
            .from("raw_market_signals").insert(records).select("id");
          if (insertError) {
            console.error(`[hunter-scan] Insert error: ${insertError.message}`);
          } else {
            totalInserted += inserted?.length || 0;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[hunter-scan] Error for "${keyword}":`, msg);
        errors.push(`${keyword}: ${msg}`);
      }
    }

    // Update scan_jobs then auto-trigger signal-processor
    await updateScanJobs(supabase, totalInserted);
    if (totalInserted > 0) {
      await triggerSignalProcessor(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    }

    return new Response(
      JSON.stringify({
        success: true,
        keywords_scanned: keywordsToScan.length,
        has_description: hasDescription,
        signals_inserted: totalInserted,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[hunter-scan] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function updateScanJobs(supabase: any, totalInserted: number) {
  const { data: activeJobs } = await supabase
    .from("scan_jobs")
    .select("id, frequency, signals_found")
    .eq("status", "active");

  if (activeJobs) {
    for (const job of activeJobs) {
      const nextRun = new Date();
      if ((job as any).frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
      else if ((job as any).frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
      else nextRun.setDate(nextRun.getDate() + 7);
      await supabase.from("scan_jobs").update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun.toISOString(),
        signals_found: ((job as any).signals_found || 0) + totalInserted,
      }).eq("id", (job as any).id);
    }
  }
}

/** Auto-trigger signal-processor after scan completes */
async function triggerSignalProcessor(supabaseUrl: string, serviceRoleKey: string) {
  try {
    const url = `${supabaseUrl}/functions/v1/signal-processor`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchSize: 50 }),
    });
    const result = await response.json();
    console.log("[hunter-scan] signal-processor result:", JSON.stringify(result));
  } catch (e) {
    console.error("[hunter-scan] Failed to trigger signal-processor:", e);
  }
}
