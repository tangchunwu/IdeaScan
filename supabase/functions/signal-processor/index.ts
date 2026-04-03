// Phase 7: Signal Processor — AI scoring + semantic clustering for niche opportunities
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RawSignal {
  id: string;
  content: string;
  source: string;
  likes_count: number;
  comments_count: number;
}

interface AIAnalysisResult {
  sentiment_score: number;
  opportunity_score: number;
  topic_tags: string[];
  pain_level: string;
}

interface LLMProvider {
  base_url: string;
  api_key: string;
  model: string;
  label: string;
}

// ── Pool-aware call with dead-provider cache ──

const deadProviders = new Set<string>(); // cache providers that fail with non-transient errors

async function callWithPool<T>(
  pool: LLMProvider[],
  fn: (apiKey: string, baseUrl: string, model: string) => Promise<T>
): Promise<T> {
  let lastError: Error | undefined;
  // Filter to only alive providers (but always keep last one as ultimate fallback)
  const alive = pool.filter((p, i) => i === pool.length - 1 || !deadProviders.has(p.label));
  if (alive.length === 0) throw new Error("All providers marked dead");

  for (let i = 0; i < alive.length; i++) {
    const provider = alive[i];
    const providerBaseUrl = provider.base_url.replace(/\/+$/, "");
    try {
      return await fn(provider.api_key, providerBaseUrl, provider.model);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;
      const is429 = msg.includes("429");
      const is5xx = /5\d{2}/.test(msg);
      const isNonTransient = msg.includes("404") || msg.includes("non-JSON") || msg.includes("HTML");

      // Mark non-transient failures so we skip this provider for the rest of the batch
      if (isNonTransient) {
        deadProviders.add(provider.label);
      }

      // For 429/5xx on the LAST alive provider, do one retry with backoff
      if ((is429 || is5xx) && i === alive.length - 1) {
        console.warn(`[Pool] Last provider "${provider.label}" got ${is429 ? "429" : "5xx"}, retrying once...`);
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
        try {
          return await fn(provider.api_key, providerBaseUrl, provider.model);
        } catch (e2) {
          lastError = e2 instanceof Error ? e2 : new Error(String(e2));
        }
      }

      console.warn(`[Pool] Provider "${provider.label}" failed: ${msg.slice(0, 120)}, trying next...`);
    }
  }
  throw lastError || new Error("All providers in pool failed");
}

// ── Step 1: Score individual signal (single attempt, no internal retry) ──

async function scoreSignal(signal: RawSignal, apiKey: string, baseUrl: string, model: string): Promise<AIAnalysisResult> {
  const prompt = `你是一个专业的市场调研分析师。分析以下用户评论/帖子，判断其是否隐含一个**未被满足的需求**或**商业机会**。

用户内容:
"""
${signal.content.slice(0, 1500)}
"""

来源: ${signal.source}
互动量: ${signal.likes_count} 赞, ${signal.comments_count} 评论

请严格返回以下 JSON (不要返回其他内容):
{
  "sentiment_score": <-1到1的浮点数>,
  "opportunity_score": <0-100整数>,
  "topic_tags": ["标签1", "标签2", "标签3"],
  "pain_level": "<mild|moderate|severe|critical>"
}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI score failed: ${response.status} ${errText.slice(0, 200)}`);
  }
  const rawText = await response.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { throw new Error(`AI returned non-JSON: ${rawText.slice(0, 200)}`); }
  const content = data.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI did not return valid JSON");

  const result = JSON.parse(jsonMatch[0]);
  return {
    sentiment_score: Math.max(-1, Math.min(1, result.sentiment_score || 0)),
    opportunity_score: Math.max(0, Math.min(100, result.opportunity_score || 0)),
    topic_tags: Array.isArray(result.topic_tags) ? result.topic_tags.slice(0, 5) : [],
    pain_level: ["mild", "moderate", "severe", "critical"].includes(result.pain_level) ? result.pain_level : "mild",
  };
}

// ── Step 2: Semantic clustering via LLM ──

interface ClusteredOpportunity {
  title: string;
  keyword: string;
  description: string;
  category: string;
  signal_ids: string[];
  avg_score: number;
  urgency_score: number;
  top_sources: string[];
}

async function clusterSignalsWithAI(
  signals: Array<{ id: string; content: string; opportunity_score: number; source_url: string | null; topic_tags: string[] | null }>,
  clusterApiKey: string,
  clusterBaseUrl: string,
  clusterModel: string
): Promise<ClusteredOpportunity[]> {
  const signalSummaries = signals.slice(0, 80).map((s, i) => 
    `[${i}] (score:${s.opportunity_score}) ${s.content.slice(0, 200)}`
  ).join("\n");

  const prompt = `你是一位商业分析专家。以下是最近采集的高分市场信号（用户痛点/需求）。请将它们按**语义主题**聚类为商业机会。

信号列表:
${signalSummaries}

规则：
1. 将语义相似的信号归入同一个商机（即使标签不同）
2. 每个商机至少包含 2 条信号
3. 给每个商机起一个简洁有力的标题（如"小红书博主急需批量修图工具"）
4. keyword 应该是一个 2-4 字的核心关键词（用于去重）
5. 最多输出 15 个商机

请返回 JSON 数组:
[
  {
    "title": "商机标题",
    "keyword": "核心关键词",
    "description": "机会描述（2-3句话）",
    "category": "分类（如 SaaS/电商/教育/健康/效率工具）",
    "signal_indices": [0, 3, 7],
    "urgency_score": 85
  }
]

只返回 JSON 数组，不要其他文字。`;

  const response = await fetch(`${clusterBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${clusterApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: clusterModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI clustering failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const rawText = await response.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { throw new Error(`AI clustering non-JSON: ${rawText.slice(0, 200)}`); }
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI clustering did not return valid JSON array");

  const clusters = JSON.parse(jsonMatch[0]);

  return clusters.map((c: any) => {
    const indices: number[] = c.signal_indices || [];
    const matchedSignals = indices.map(i => signals[i]).filter(Boolean);
    return {
      title: c.title || "未知机会",
      keyword: c.keyword || c.title?.slice(0, 8) || "未分类",
      description: c.description || "",
      category: c.category || "mixed",
      signal_ids: matchedSignals.map(s => s.id),
      avg_score: matchedSignals.length > 0
        ? Math.round(matchedSignals.reduce((sum, s) => sum + (s.opportunity_score || 0), 0) / matchedSignals.length)
        : 0,
      urgency_score: Math.min(100, Math.max(0, c.urgency_score || 0)),
      top_sources: [...new Set(matchedSignals.map(s => s.source_url).filter(Boolean))].slice(0, 5) as string[],
    };
  }).filter((c: ClusteredOpportunity) => c.signal_ids.length >= 2);
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Load the full LLM pool (includes all configured providers + Lovable AI fallback)
    const { resolvePool } = await import("../_shared/config-resolver.ts");
    const llmPool = await resolvePool("llm");
    if (llmPool.length === 0) throw new Error("No LLM providers configured");
    console.log(`[Processor] LLM pool: ${llmPool.map(p => p.label).join(" → ")}`);

    let batchSize = 8;
    try { const body = await req.json(); batchSize = body.batchSize || 8; } catch { /* default */ }
    // Reset dead providers cache for each invocation
    deadProviders.clear();

    // ═══ Phase A: Score unprocessed signals ═══
    const { data: unprocessed, error: fetchError } = await supabase
      .from("raw_market_signals")
      .select("id, content, source, likes_count, comments_count")
      .is("processed_at", null)
      .neq("content_type", "source_citation")
      .order("scanned_at", { ascending: false })
      .limit(batchSize);

    if (fetchError) throw new Error(`Failed to fetch signals: ${fetchError.message}`);
    console.log(`[Processor] Found ${unprocessed?.length || 0} unprocessed signals`);

    let successCount = 0, failCount = 0;
    let consecutiveFails = 0;

    for (const signal of (unprocessed as RawSignal[]) || []) {
      if (consecutiveFails >= 5) {
        console.log(`[Processor] Stopping early: ${consecutiveFails} consecutive failures.`);
        break;
      }

      try {
        const analysis = await callWithPool(llmPool, (apiKey, baseUrl, model) =>
          scoreSignal(signal, apiKey, baseUrl, model)
        );
        const { error: updateError } = await supabase
          .from("raw_market_signals")
          .update({
            sentiment_score: analysis.sentiment_score,
            opportunity_score: analysis.opportunity_score,
            topic_tags: analysis.topic_tags,
            pain_level: analysis.pain_level,
            processed_at: new Date().toISOString(),
          })
          .eq("id", signal.id);

        if (updateError) { failCount++; } else { successCount++; }
        consecutiveFails = 0;
      } catch (e) {
        console.error(`[Processor] Score error ${signal.id} (all providers exhausted):`, e);
        failCount++;
        consecutiveFails++;
      }
      // Brief delay between signals
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[Processor] Scoring done: ${successCount} ok, ${failCount} failed`);

    // ═══ Phase B: Semantic clustering → niche_opportunities ═══
    let opportunitiesUpserted = 0;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: highSignals } = await supabase
        .from("raw_market_signals")
        .select("id, content, source, source_url, opportunity_score, topic_tags")
        .gte("opportunity_score", 60)
        .not("processed_at", "is", null)
        .gte("scanned_at", sevenDaysAgo)
        .order("opportunity_score", { ascending: false })
        .limit(200);

      if (highSignals && highSignals.length >= 3) {
        console.log(`[Processor] Clustering ${highSignals.length} high-score signals via pool`);
        const clusters = await callWithPool(llmPool, (apiKey, baseUrl, model) =>
          clusterSignalsWithAI(highSignals, apiKey, baseUrl, model)
        );
        console.log(`[Processor] AI returned ${clusters.length} opportunity clusters`);

        for (const cluster of clusters) {
          const { error: upsertErr } = await supabase
            .from("niche_opportunities")
            .upsert({
              keyword: cluster.keyword,
              title: cluster.title,
              description: cluster.description,
              urgency_score: cluster.urgency_score,
              signal_count: cluster.signal_ids.length,
              avg_opportunity_score: cluster.avg_score,
              top_sources: cluster.top_sources,
              category: cluster.category,
              discovered_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "keyword" });

          if (upsertErr) {
            console.error(`[Processor] Upsert "${cluster.keyword}" failed:`, upsertErr);
          } else {
            opportunitiesUpserted++;
          }
        }
        console.log(`[Processor] Upserted ${opportunitiesUpserted} niche opportunities`);
      } else {
        console.log(`[Processor] Only ${highSignals?.length || 0} high-score signals, skipping clustering`);
      }
    } catch (aggErr) {
      console.error("[Processor] Clustering error:", aggErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scored: successCount,
        score_failed: failCount,
        opportunities_upserted: opportunitiesUpserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Processor] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
