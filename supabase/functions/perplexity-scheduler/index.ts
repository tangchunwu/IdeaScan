import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── 领域定义 ──────────────────────────────────────────────
const DOMAIN_CATEGORIES: { name: string; description: string; seedKeywords: string[] }[] = [
  { name: "AI工具", description: "AI应用、大模型工具、AI变现", seedKeywords: ["AI写作工具", "AI绘画变现", "ChatGPT应用"] },
  { name: "副业赚钱", description: "副业、被动收入、自媒体变现", seedKeywords: ["副业推荐", "被动收入", "自媒体变现"] },
  { name: "电商创业", description: "跨境电商、独立站、直播带货", seedKeywords: ["跨境电商", "独立站运营", "直播带货"] },
  { name: "教育培训", description: "在线教育、知识付费、技能变现", seedKeywords: ["在线教育创业", "技能变现", "付费社群"] },
  { name: "健康生活", description: "减肥、心理健康、养生保健", seedKeywords: ["减肥产品", "心理咨询创业", "睡眠改善"] },
  { name: "数字游民", description: "远程办公、自由职业、海外接单", seedKeywords: ["远程办公工具", "自由职业接单", "数字游民生活"] },
  { name: "宠物经济", description: "宠物用品、宠物服务、萌宠博主", seedKeywords: ["宠物用品创业", "宠物服务", "萌宠博主"] },
  { name: "个人IP", description: "个人品牌、短视频、社交媒体运营", seedKeywords: ["个人品牌打造", "短视频创业", "小红书运营"] },
  { name: "SaaS/开发", description: "独立开发、SaaS产品、低代码", seedKeywords: ["独立开发", "SaaS创业", "低代码工具"] },
  { name: "银发经济", description: "老年产品、适老化、养老服务", seedKeywords: ["老年人产品", "适老化设计", "养老服务创业"] },
];

/** 每日洞察配额（1 条 insight = 1 配额） */
const DAILY_QUOTA = 50;
const MAX_DEEP_SCAN_PER_RUN = 2;
const DEDUP_HOURS = 24;

// ── Types ────────────────────────────────────────────────
interface InsightResult {
  analysis: string;
  pain_points: string[];
  opportunity_score: number;
  heat_indicator: number;
  pain_level: string;
  sentiment: string;
  topic_tags: string[];
  business_opportunities?: string[];
  competitor_weaknesses?: string[];
}

// ── Helpers ──────────────────────────────────────────────
function normalizePainLevel(level: string | null | undefined): string {
  if (!level || typeof level !== "string") return "moderate";
  const l = level.toLowerCase().trim();
  const map: Record<string, string> = {
    high: "severe", medium: "moderate", low: "mild",
    severe: "severe", moderate: "moderate", mild: "mild", critical: "critical",
    "非常高": "critical", "高": "severe", "中": "moderate", "中等": "moderate", "低": "mild",
  };
  return map[l] || "moderate";
}

/** 尝试修复 Perplexity 返回的不规范 JSON（analysis 字段中含未转义引号） */
function robustJsonParse(raw: string): any | null {
  // 1. 直接尝试
  try { return JSON.parse(raw); } catch {}

  // 2. 尝试用正则提取各字段分别解析（避免 analysis 长文本中的引号问题）
  try {
    // 提取 analysis 字段的值（最长匹配）
    const analysisMatch = raw.match(/"analysis"\s*:\s*"([\s\S]*?)"\s*,\s*"pain_points"/);
    if (analysisMatch) {
      // 转义 analysis 内部的引号
      const escapedAnalysis = analysisMatch[1].replace(/(?<!\\)"/g, '\\"');
      const fixed = raw.replace(analysisMatch[1], escapedAnalysis);
      try { return JSON.parse(fixed); } catch {}
    }
  } catch {}

  // 3. 最后手段：去掉 analysis 字段，只保留结构化字段
  try {
    const withoutAnalysis = raw
      .replace(/"analysis"\s*:\s*"[\s\S]*?"\s*,\s*"pain_points"/, '"analysis": "(parsed separately)", "pain_points"');
    const parsed = JSON.parse(withoutAnalysis);
    // 尝试从原始文本提取 analysis
    const aMatch = raw.match(/"analysis"\s*:\s*"([\s\S]*?)"\s*,\s*"pain_points"/);
    if (aMatch) parsed.analysis = aMatch[1].replace(/\\"/g, '"');
    return parsed;
  } catch {}

  return null;
}

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function checkDailyQuota(supabase: any): Promise<{ used: number; remaining: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("raw_market_signals")
    .select("id", { count: "exact", head: true })
    .eq("source", "perplexity")
    .eq("content_type", "insight")
    .gte("scanned_at", todayStart.toISOString());
  const used = error ? 0 : (count || 0);
  return { used, remaining: Math.max(0, DAILY_QUOTA - used) };
}

async function getRecentInsightHashes(supabase: any): Promise<Set<string>> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("raw_market_signals")
    .select("content_hash")
    .eq("source", "perplexity")
    .eq("content_type", "insight")
    .gte("scanned_at", since)
    .not("content_hash", "is", null);
  const hashes = new Set<string>();
  for (const row of data || []) {
    if (row.content_hash) hashes.add(row.content_hash);
  }
  return hashes;
}

function getDomainForThisRun(): typeof DOMAIN_CATEGORIES[number] {
  const hour = new Date().getHours();
  return DOMAIN_CATEGORIES[hour % DOMAIN_CATEGORIES.length];
}

// ── 阶段 1: 领域探索 (Discovery) ─────────────────────────
async function discoverKeywords(
  domain: typeof DOMAIN_CATEGORIES[number],
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `你是一位资深市场情报分析师。请分析【${domain.name}】（${domain.description}）这个赛道最近 7 天的最新动态：

1. 有哪些正在爆发的新趋势或热点话题？（社交媒体上讨论量激增的）
2. 哪些细分方向出现了明显的用户需求增长或痛点爆发？
3. 有没有新出现的创业机会或未被满足的市场缺口？

请返回 JSON 格式，包含 5-8 个值得深挖的具体关键词或话题。每个关键词应该是具体、可搜索的（如"AI自动剪辑工具"而非泛泛的"AI"）。

格式：
{ "keywords": ["关键词1", "关键词2", ...], "reasoning": "简要说明为什么选这些关键词" }

只返回 JSON，不要其他文字。`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        temperature: 0.5,
        search_recency_filter: "week",
        messages: [
          { role: "system", content: "你是市场趋势发现专家，擅长从互联网信息中识别新兴热点和创业机会。只返回有效的 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[discovery] Perplexity API error: ${response.status} - ${text.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/\[(\d+)\]/g, "").replace(/\s+/g, " ");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const keywords = parsed.keywords || [];
      console.log(`[discovery] Domain "${domain.name}" discovered ${keywords.length} keywords:`, keywords);
      return keywords.filter((k: any) => typeof k === "string" && k.length >= 2);
    }
  } catch (e) {
    console.error(`[discovery] Failed for domain "${domain.name}":`, e);
  }
  return [];
}

// ── 阶段 2: 深度分析（Insight 模式）──────────────────────
async function deepAnalyze(
  keyword: string,
  baseUrl: string,
  apiKey: string
): Promise<{ insight: InsightResult | null; citations: string[] }> {
  const prompt = `关于"${keyword}"，请提供一份综合市场情报分析（400-600字）：

1. **趋势概要**：这个领域当前的核心趋势是什么？近期有什么重要变化？
2. **用户痛点**：最突出的 3-5 个用户痛点（请引用具体场景或用户反馈，不要泛泛而谈）
3. **商业机会**：最有潜力的 1-2 个创业切入点，为什么这些切入点可行？
4. **竞争格局**：现有方案的主要短板是什么？用户对现有产品/服务最不满意的地方？

请返回 JSON（只返回 JSON，不要其他文字）：
{
  "analysis": "完整的综合分析文本（400-600字，含具体场景和数据）",
  "pain_points": ["具体痛点1", "具体痛点2", "具体痛点3"],
  "opportunity_score": 75,
  "heat_indicator": 80,
  "pain_level": "high",
  "sentiment": "negative",
  "topic_tags": ["标签1", "标签2", "标签3"],
  "business_opportunities": ["机会1", "机会2"],
  "competitor_weaknesses": ["短板1", "短板2"]
}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      temperature: 0.3,
      messages: [
        { role: "system", content: "你是一位资深市场情报分析师，擅长从公开网络信息中挖掘深层用户痛点和未被满足的需求。你的分析要具体、有洞察力，避免泛泛而谈。只返回有效的 JSON。" },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = data.citations ?? [];

  let insight: InsightResult | null = null;
  try {
    const cleaned = content.replace(/,?\s*\[(\d+)\]\s*/g, " ").replace(/\s+/g, " ");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      insight = robustJsonParse(jsonMatch[0]);
      if (!insight) {
        console.error(`[deep-analyze] robustJsonParse returned null for "${keyword}", raw length=${jsonMatch[0].length}`);
      }
    }
  } catch (e) {
    console.error(`[deep-analyze] Failed to parse response for "${keyword}":`, e);
  }

  return { insight, citations };
}

// ── 处理单个关键词：写入 insight + citations ──────────────
async function processKeyword(
  keyword: string,
  domain: typeof DOMAIN_CATEGORIES[number],
  supabase: any,
  baseUrl: string,
  apiKey: string,
  existingHashes: Set<string>
): Promise<{ insightInserted: boolean; citationsInserted: number; trendingUpdated: boolean }> {
  const { insight, citations } = await deepAnalyze(keyword, baseUrl, apiKey);

  if (!insight || !insight.analysis || insight.analysis.length < 50) {
    console.warn(`[process] "${keyword}": no valid insight returned`);
    return { insightInserted: false, citationsInserted: 0, trendingUpdated: false };
  }

  // ── 去重检查 ──
  const contentHash = await hashContent(insight.analysis);
  if (existingHashes.has(contentHash)) {
    console.log(`[process] "${keyword}": duplicate insight, skipping`);
    return { insightInserted: false, citationsInserted: 0, trendingUpdated: false };
  }
  existingHashes.add(contentHash);

  // ── 插入 insight（父记录）──
  const insightRecord = {
    content: insight.analysis,
    source: "perplexity",
    source_url: citations[0] || null,
    content_type: "insight",
    author_name: null,
    likes_count: 0,
    comments_count: 0,
    content_hash: contentHash,
    topic_tags: insight.topic_tags || [],
    pain_level: normalizePainLevel(insight.pain_level),
    opportunity_score: Math.min(100, Math.max(0, insight.opportunity_score || 0)),
    sentiment_score: insight.sentiment === "negative" ? -0.5 : insight.sentiment === "mixed" ? 0 : 0.3,
    scanned_at: new Date().toISOString(),
  };

  const { data: insertedInsight, error: insightError } = await supabase
    .from("raw_market_signals")
    .insert(insightRecord)
    .select("id")
    .single();

  if (insightError || !insertedInsight) {
    console.error(`[process] Insert insight error for "${keyword}":`, insightError?.message);
    return { insightInserted: false, citationsInserted: 0, trendingUpdated: false };
  }

  const parentId = insertedInsight.id;
  console.log(`[process] "${keyword}": insight inserted (id=${parentId})`);

  // ── 插入 citations（子记录）──
  let citationsInserted = 0;
  for (const url of citations) {
    if (!url || typeof url !== "string") continue;
    const citationRecord = {
      content: `Citation source for: ${keyword}`,
      source: "perplexity",
      source_url: url,
      content_type: "source_citation",
      author_name: null,
      likes_count: 0,
      comments_count: 0,
      parent_signal_id: parentId,
      scanned_at: new Date().toISOString(),
      // citations don't need analysis fields — they'll be skipped by signal-processor
    };
    const { error } = await supabase.from("raw_market_signals").insert(citationRecord);
    if (error) {
      console.error(`[process] Citation insert error:`, error.message);
    } else {
      citationsInserted++;
    }
  }
  console.log(`[process] "${keyword}": ${citationsInserted}/${citations.length} citations inserted`);

  // ── 更新 trending_topics ──
  const sentimentMap: Record<string, { pos: number; neg: number; neu: number }> = {
    negative: { pos: 10, neg: 70, neu: 20 },
    mixed: { pos: 30, neg: 30, neu: 40 },
    positive: { pos: 60, neg: 10, neu: 30 },
  };
  const sent = sentimentMap[insight.sentiment || "mixed"] || sentimentMap.mixed;

  const trendingData = {
    keyword,
    category: domain.name,
    heat_score: Math.min(100, Math.round(insight.heat_indicator || 50)),
    sample_count: citations.length,
    avg_engagement: Math.round(insight.opportunity_score || 0),
    sentiment_positive: sent.pos,
    sentiment_negative: sent.neg,
    sentiment_neutral: sent.neu,
    top_pain_points: (insight.pain_points || []).slice(0, 5),
    related_keywords: (insight.topic_tags || []).filter((t: string) => t !== keyword).slice(0, 10),
    sources: [{ platform: "perplexity", count: citations.length }],
    source_type: "perplexity_scan",
    is_active: true,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_crawled_at: new Date().toISOString(),
    cached_social_data: {
      source: "perplexity",
      insight_id: parentId,
      citations: citations.slice(0, 10),
      pain_points: insight.pain_points,
      business_opportunities: insight.business_opportunities,
      competitor_weaknesses: insight.competitor_weaknesses,
      scanned_at: new Date().toISOString(),
    },
    cache_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("trending_topics")
    .upsert(trendingData, { onConflict: "keyword" });

  if (upsertError) {
    console.error(`[process] Trending upsert error for "${keyword}":`, upsertError.message);
  }

  return { insightInserted: true, citationsInserted, trendingUpdated: !upsertError };
}

// ── 从 scan_jobs + user_topic_clicks 收集用户关注词 ───────
async function collectUserKeywords(supabase: any): Promise<string[]> {
  const keywords: string[] = [];

  const { data: jobs } = await supabase
    .from("scan_jobs")
    .select("keywords")
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);

  for (const job of jobs || []) {
    for (const kw of job.keywords || []) {
      if (!keywords.includes(kw)) keywords.push(kw);
    }
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: clicks } = await supabase
    .from("user_topic_clicks")
    .select("keyword")
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  const kwCounts = new Map<string, number>();
  for (const row of clicks || []) {
    if (row.keyword) kwCounts.set(row.keyword, (kwCounts.get(row.keyword) || 0) + 1);
  }
  for (const kw of Array.from(kwCounts.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k)) {
    if (!keywords.includes(kw)) keywords.push(kw);
  }

  return keywords;
}

// ── 主入口 ───────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const baseUrl = Deno.env.get("PERPLEXITY_BASE_URL");
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PERPLEXITY_BASE_URL or PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. 配额检查（只计 insight 条数）
    const quota = await checkDailyQuota(supabase);
    console.log(`[scheduler] Daily insight quota: ${quota.used}/${DAILY_QUOTA} used`);
    if (quota.remaining <= 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Daily quota exhausted", used: quota.used }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 选取本轮领域
    const domain = getDomainForThisRun();
    console.log(`[scheduler] This run's domain: ${domain.name}`);

    // 3. Discovery — 动态发现关键词
    let discoveredKeywords = await discoverKeywords(domain, baseUrl, apiKey);

    const userKeywords = await collectUserKeywords(supabase);
    if (userKeywords.length > 0) {
      console.log(`[scheduler] Adding ${userKeywords.length} user keywords`);
      for (const kw of userKeywords.slice(0, 3)) {
        if (!discoveredKeywords.includes(kw)) discoveredKeywords.push(kw);
      }
    }

    if (discoveredKeywords.length === 0) {
      console.log(`[scheduler] Discovery returned 0 keywords, falling back to seed keywords`);
      discoveredKeywords = [...domain.seedKeywords];
    }

    // 4. 去重 + 取前 N 个
    const existingHashes = await getRecentInsightHashes(supabase);
    const keywordsToScan = discoveredKeywords.slice(0, MAX_DEEP_SCAN_PER_RUN);

    if (keywordsToScan.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No keywords to scan", domain: domain.name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scheduler] Deep analyzing keywords:`, keywordsToScan);

    // 5. Deep Analyze — 逐个生成综合洞察
    let insightsInserted = 0;
    let totalCitations = 0;
    let trendingUpdated = 0;
    const errors: string[] = [];

    for (const keyword of keywordsToScan) {
      try {
        const result = await processKeyword(keyword, domain, supabase, baseUrl, apiKey, existingHashes);
        if (result.insightInserted) insightsInserted++;
        totalCitations += result.citationsInserted;
        if (result.trendingUpdated) trendingUpdated++;
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[scheduler] Error for "${keyword}":`, msg);
        errors.push(`${keyword}: ${msg}`);
      }
    }

    // 6. 更新 scan_jobs
    const { data: activeJobs } = await supabase
      .from("scan_jobs")
      .select("id, frequency, signals_found")
      .eq("status", "active");

    if (activeJobs) {
      for (const job of activeJobs) {
        const nextRun = new Date();
        if (job.frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
        else if (job.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
        else nextRun.setDate(nextRun.getDate() + 7);
        await supabase.from("scan_jobs").update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun.toISOString(),
          signals_found: (job.signals_found || 0) + insightsInserted,
        }).eq("id", job.id);
      }
    }

    // 7. 自动触发 signal-processor
    if (insightsInserted > 0) {
      try {
        console.log(`[scheduler] Auto-triggering signal-processor...`);
        const spResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/signal-processor`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ auto_triggered: true }),
          }
        );
        console.log(`[scheduler] signal-processor response: ${spResponse.status}`);
      } catch (e) {
        console.error(`[scheduler] Failed to trigger signal-processor:`, e);
      }
    }

    console.log(`[scheduler] Done: domain=${domain.name}, discovered=${discoveredKeywords.length}, scanned=${keywordsToScan.length}, insights=${insightsInserted}, citations=${totalCitations}, trending=${trendingUpdated}`);

    return new Response(
      JSON.stringify({
        success: true,
        domain: domain.name,
        discovered_keywords: discoveredKeywords,
        keywords_scanned: keywordsToScan,
        insights_inserted: insightsInserted,
        citations_inserted: totalCitations,
        trending_updated: trendingUpdated,
        quota: { used: quota.used + insightsInserted, daily_limit: DAILY_QUOTA },
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scheduler] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
