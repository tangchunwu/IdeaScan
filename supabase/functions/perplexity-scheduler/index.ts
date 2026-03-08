import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 种子关键词 — 当没有 scan_jobs 和用户行为数据时的兜底
const SEED_KEYWORDS: string[] = [
  "AI副业", "副业推荐", "自媒体变现", "远程办公", "AI工具赚钱",
];

const DAILY_QUOTA = 100; // 每日 Perplexity 信号上限
const MAX_KEYWORDS_PER_RUN = 3; // 每次最多处理关键词数
const DEDUP_HOURS = 24; // 去重窗口（小时）

interface MarketSignal {
  summary: string;
  source_url: string;
  topic_tags: string[];
  opportunity_score: number;
  pain_level: string;
  sentiment: string;
  heat_indicator?: number;
  pain_points?: string[];
  related_tags?: string[];
}

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * 检查今日 Perplexity 配额使用量
 */
async function checkDailyQuota(supabase: any): Promise<{ used: number; remaining: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("raw_market_signals")
    .select("id", { count: "exact", head: true })
    .eq("source", "perplexity")
    .gte("scanned_at", todayStart.toISOString());

  const used = error ? 0 : (count || 0);
  return { used, remaining: Math.max(0, DAILY_QUOTA - used) };
}

/**
 * 获取最近 DEDUP_HOURS 小时内已扫描的关键词
 */
async function getRecentlyScannedKeywords(supabase: any): Promise<Set<string>> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("raw_market_signals")
    .select("topic_tags")
    .eq("source", "perplexity")
    .gte("scanned_at", since);

  const seen = new Set<string>();
  for (const row of data || []) {
    for (const tag of row.topic_tags || []) {
      seen.add(tag.toLowerCase());
    }
  }
  return seen;
}

/**
 * 从 scan_jobs + user_topic_clicks 获取高优先级关键词
 */
async function collectKeywords(supabase: any): Promise<string[]> {
  const keywords: string[] = [];

  // 1. 从 active scan_jobs 取到期任务的关键词
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

  // 2. 从 user_topic_clicks 取最近 7 天高频词
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: clicks } = await supabase
    .from("user_topic_clicks")
    .select("keyword")
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  const kwCounts = new Map<string, number>();
  for (const row of clicks || []) {
    if (row.keyword) {
      kwCounts.set(row.keyword, (kwCounts.get(row.keyword) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);

  for (const kw of sorted) {
    if (!keywords.includes(kw)) keywords.push(kw);
  }

  // 3. 从 trending_topics 取高验证量的相关关键词
  const { data: hotTopics } = await supabase
    .from("trending_topics")
    .select("keyword, related_keywords")
    .gt("validation_count", 0)
    .order("validation_count", { ascending: false })
    .limit(5);

  for (const topic of hotTopics || []) {
    for (const kw of [topic.keyword, ...(topic.related_keywords || [])]) {
      if (kw && !keywords.includes(kw)) keywords.push(kw);
    }
  }

  // 4. 如果仍然没有关键词，使用种子关键词
  if (keywords.length === 0) {
    return [...SEED_KEYWORDS];
  }

  return keywords;
}

/**
 * 调用 Perplexity 搜索，返回信号 + 趋势数据
 */
async function searchPerplexity(
  keyword: string,
  baseUrl: string,
  apiKey: string
): Promise<{ signals: MarketSignal[]; citations: string[] }> {
  const prompt = `搜索关于"${keyword}"的最新用户痛点、需求趋势和商业机会。
从社交媒体（小红书、Reddit、知乎、微博、抖音评论区）、论坛、行业报告等渠道汇总。

请返回 JSON 格式，包含 5-8 条市场信号。每条信号包含：
- summary: 痛点或需求的简洁描述（1-2句话）
- source_url: 来源URL（如果有）
- topic_tags: 2-3个话题标签
- opportunity_score: 商机评分（0-100）
- pain_level: 痛点等级（"high"/"medium"/"low"）
- sentiment: 情感倾向（"negative"/"neutral"/"mixed"）
- heat_indicator: 话题热度估计（0-100，基于你搜索到的讨论量和关注度）
- pain_points: 提取的具体痛点短句（1-3条）
- related_tags: 相关话题标签（2-5个）

只返回 JSON 数组，不要其他文字。`;

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
        { role: "system", content: "你是一个市场情报分析师。从公开网络信息中提取用户痛点和商业机会。只返回有效的 JSON 数组。" },
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

  let signals: MarketSignal[] = [];
  try {
    const cleaned = content
      .replace(/,?\s*\[(\d+)\]\s*/g, " ")
      .replace(/\s+/g, " ");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      signals = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error(`[perplexity-scheduler] Failed to parse response for "${keyword}":`, e);
  }

  // 补充 citations
  if (citations.length > 0) {
    signals.forEach((s, i) => {
      if (!s.source_url && citations[i]) {
        s.source_url = typeof citations[i] === "string" ? citations[i] : "";
      }
    });
  }

  return { signals, citations };
}

/**
 * 将信号写入 raw_market_signals + 更新 trending_topics
 */
async function processKeyword(
  keyword: string,
  supabase: any,
  baseUrl: string,
  apiKey: string
): Promise<{ inserted: number; trendingUpdated: boolean }> {
  const { signals, citations } = await searchPerplexity(keyword, baseUrl, apiKey);
  console.log(`[perplexity-scheduler] "${keyword}": ${signals.length} signals, ${citations.length} citations`);

  if (signals.length === 0) return { inserted: 0, trendingUpdated: false };

  // 1. 写入 raw_market_signals
  const records = [];
  for (const signal of signals) {
    if (!signal.summary || signal.summary.length < 10) continue;
    const contentHash = await hashContent(signal.summary);
    records.push({
      content: signal.summary,
      source: "perplexity",
      source_url: signal.source_url || null,
      content_type: "intelligence",
      author_name: null,
      likes_count: 0,
      comments_count: 0,
      content_hash: contentHash,
      topic_tags: signal.topic_tags || [],
      pain_level: signal.pain_level || null,
      opportunity_score: Math.min(100, Math.max(0, signal.opportunity_score || 0)),
      sentiment_score: signal.sentiment === "negative" ? -0.5 : signal.sentiment === "mixed" ? 0 : 0.3,
      scanned_at: new Date().toISOString(),
    });
  }

  let insertedCount = 0;
  if (records.length > 0) {
    const { data: inserted, error } = await supabase
      .from("raw_market_signals")
      .insert(records)
      .select("id");

    if (error) {
      console.error(`[perplexity-scheduler] Insert error for "${keyword}":`, error.message);
    } else {
      insertedCount = inserted?.length || 0;
    }
  }

  // 2. 更新 trending_topics — 汇总信号数据
  const allPainPoints: string[] = [];
  const allRelatedTags: string[] = [];
  let totalOpportunity = 0;
  let negativeCount = 0;
  let positiveCount = 0;
  let neutralCount = 0;

  for (const signal of signals) {
    totalOpportunity += signal.opportunity_score || 0;
    for (const pp of signal.pain_points || []) {
      if (!allPainPoints.includes(pp)) allPainPoints.push(pp);
    }
    for (const tag of [...(signal.topic_tags || []), ...(signal.related_tags || [])]) {
      if (tag !== keyword && !allRelatedTags.includes(tag)) allRelatedTags.push(tag);
    }
    if (signal.sentiment === "negative") negativeCount++;
    else if (signal.sentiment === "mixed") neutralCount++;
    else positiveCount++;
  }

  const total = negativeCount + positiveCount + neutralCount || 1;
  const avgHeat = signals.reduce((sum, s) => sum + (s.heat_indicator || 50), 0) / signals.length;
  const heatScore = Math.min(100, Math.round(avgHeat));

  // 识别 category
  const categoryMap: Record<string, string[]> = {
    "AI工具": ["AI", "ChatGPT", "人工智能", "AI工具", "AI绘画", "AI写作"],
    "副业赚钱": ["副业", "赚钱", "兼职", "被动收入", "变现"],
    "个人成长": ["时间管理", "自律", "效率", "学习", "职场"],
    "健康生活": ["减肥", "健身", "睡眠", "心理", "养生"],
    "数字游民": ["远程", "自由职业", "数字游民", "在线创业"],
  };

  let category = "用户关注";
  for (const [cat, words] of Object.entries(categoryMap)) {
    if (words.some(w => keyword.includes(w))) {
      category = cat;
      break;
    }
  }

  const trendingData = {
    keyword,
    category,
    heat_score: heatScore,
    sample_count: signals.length,
    avg_engagement: Math.round(totalOpportunity / signals.length),
    sentiment_positive: Math.round((positiveCount / total) * 100),
    sentiment_negative: Math.round((negativeCount / total) * 100),
    sentiment_neutral: Math.round((neutralCount / total) * 100),
    top_pain_points: allPainPoints.slice(0, 5),
    related_keywords: allRelatedTags.slice(0, 10),
    sources: [{ platform: "perplexity", count: signals.length }],
    source_type: "perplexity_scan",
    is_active: true,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_crawled_at: new Date().toISOString(),
    cached_social_data: {
      source: "perplexity",
      citations: citations.slice(0, 10),
      signal_count: signals.length,
      scanned_at: new Date().toISOString(),
    },
    cache_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("trending_topics")
    .upsert(trendingData, { onConflict: "keyword" });

  if (upsertError) {
    console.error(`[perplexity-scheduler] Trending upsert error for "${keyword}":`, upsertError.message);
  }

  return { inserted: insertedCount, trendingUpdated: !upsertError };
}

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

    // 1. 配额检查
    const quota = await checkDailyQuota(supabase);
    console.log(`[perplexity-scheduler] Daily quota: ${quota.used}/${DAILY_QUOTA} used, ${quota.remaining} remaining`);

    if (quota.remaining <= 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Daily quota exhausted", used: quota.used }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 收集关键词
    const allKeywords = await collectKeywords(supabase);
    console.log(`[perplexity-scheduler] Collected ${allKeywords.length} candidate keywords`);

    // 3. 去重 — 排除最近已扫描的
    const recentlyScanned = await getRecentlyScannedKeywords(supabase);
    const freshKeywords = allKeywords.filter(kw => !recentlyScanned.has(kw.toLowerCase()));
    console.log(`[perplexity-scheduler] After dedup: ${freshKeywords.length} fresh keywords (filtered ${allKeywords.length - freshKeywords.length})`);

    // 如果全部去重完，从种子关键词中随机选
    const keywordsToScan = freshKeywords.length > 0
      ? freshKeywords.slice(0, MAX_KEYWORDS_PER_RUN)
      : SEED_KEYWORDS.filter(kw => !recentlyScanned.has(kw.toLowerCase())).slice(0, MAX_KEYWORDS_PER_RUN);

    if (keywordsToScan.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All keywords recently scanned, skipping", quota_used: quota.used }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[perplexity-scheduler] Scanning keywords:`, keywordsToScan);

    // 4. 逐个处理
    let totalInserted = 0;
    let trendingUpdated = 0;
    const errors: string[] = [];

    for (const keyword of keywordsToScan) {
      try {
        const result = await processKeyword(keyword, supabase, baseUrl, apiKey);
        totalInserted += result.inserted;
        if (result.trendingUpdated) trendingUpdated++;

        // API 间隔
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[perplexity-scheduler] Error for "${keyword}":`, msg);
        errors.push(`${keyword}: ${msg}`);
      }
    }

    // 5. 更新相关 scan_jobs
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
          signals_found: (job.signals_found || 0) + totalInserted,
        }).eq("id", job.id);
      }
    }

    console.log(`[perplexity-scheduler] Done: ${totalInserted} signals inserted, ${trendingUpdated} trending topics updated`);

    return new Response(
      JSON.stringify({
        success: true,
        keywords_scanned: keywordsToScan,
        signals_inserted: totalInserted,
        trending_updated: trendingUpdated,
        quota: { used: quota.used + totalInserted, daily_limit: DAILY_QUOTA },
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[perplexity-scheduler] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
