import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 种子关键词 — 当没有 scan_jobs 和用户行为数据时的兜底
// 按类别分组的种子关键词库，每次运行轮转选取不同类别
const SEED_KEYWORD_GROUPS: Record<string, string[]> = {
  "AI工具": ["AI写作工具", "AI绘画变现", "ChatGPT应用", "AI编程助手", "AI工具赚钱"],
  "副业赚钱": ["副业推荐", "被动收入", "自媒体变现", "知识付费", "AI副业"],
  "电商创业": ["跨境电商", "独立站运营", "直播带货", "一件代发", "Shopify开店"],
  "教育培训": ["在线教育创业", "技能变现", "考证培训", "付费社群", "在线课程"],
  "健康生活": ["减肥产品", "心理咨询创业", "养生保健", "睡眠改善", "健身私教"],
  "数字游民": ["远程办公工具", "自由职业接单", "数字游民生活", "海外接单", "远程协作"],
  "宠物经济": ["宠物用品创业", "宠物服务", "宠物食品", "萌宠博主", "宠物医疗"],
  "个人IP": ["个人品牌打造", "短视频创业", "小红书运营", "知乎变现", "播客创业"],
  "SaaS/开发": ["独立开发", "SaaS创业", "低代码工具", "开源项目变现", "API产品"],
  "银发经济": ["老年人产品", "适老化设计", "养老服务创业", "银发社交", "老年教育"],
};

const ALL_CATEGORIES = Object.keys(SEED_KEYWORD_GROUPS);

/** 根据当前小时轮转选取种子类别 */
function getSeedKeywordsForRun(): string[] {
  const hour = new Date().getHours();
  const categoryIndex = Math.floor(hour / 4) % ALL_CATEGORIES.length;
  // 选取 2 个相邻类别，确保多样性
  const cat1 = ALL_CATEGORIES[categoryIndex];
  const cat2 = ALL_CATEGORIES[(categoryIndex + 1) % ALL_CATEGORIES.length];
  const combined = [...SEED_KEYWORD_GROUPS[cat1], ...SEED_KEYWORD_GROUPS[cat2]];
  // 随机打乱后取前 5 个
  return combined.sort(() => Math.random() - 0.5).slice(0, 5);
}

const DAILY_QUOTA = 100;
const MAX_KEYWORDS_PER_RUN = 3;
const DEDUP_HOURS = 24;

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
 * 根据关键词生成多角度语义查询 prompts
 */
function buildSemanticPrompts(keyword: string): string[] {
  return [
    `关于"${keyword}"这个领域：
1. 用户最近在社交媒体（小红书、知乎、微博、Reddit、抖音评论区）上最常抱怨什么？有哪些产品或服务让他们非常不满意？
2. 他们愿意为什么解决方案付费？有没有"付费意愿强但供给不足"的需求？
3. 请提取具体的用户原话或痛点场景，而不是泛泛而谈。`,
    `从创业和商业机会的角度分析"${keyword}"：
1. 这个领域有哪些新兴的、未被充分服务的细分市场？
2. 现有的头部玩家有什么明显的短板或用户流失原因？
3. 有没有可以用低成本验证的小众切入点？`,
  ];
}

/**
 * 调用 Perplexity 搜索，使用语义化 prompt
 */
async function searchPerplexity(
  keyword: string,
  baseUrl: string,
  apiKey: string
): Promise<{ signals: MarketSignal[]; citations: string[] }> {
  const prompts = buildSemanticPrompts(keyword);
  // 随机选一个角度，避免重复
  const selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];

  const fullPrompt = `${selectedPrompt}

请返回 JSON 格式，包含 5-8 条市场信号。每条信号包含：
- summary: 痛点或需求的简洁描述（1-2句话，尽量引用具体用户场景）
- source_url: 来源URL（如果有）
- topic_tags: 2-3个话题标签
- opportunity_score: 商机评分（0-100）
- pain_level: 痛点等级（"high"/"medium"/"low"）
- sentiment: 情感倾向（"negative"/"neutral"/"mixed"）
- heat_indicator: 话题热度估计（0-100）
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
        { role: "system", content: "你是一位资深市场情报分析师，擅长从公开网络信息中挖掘深层用户痛点和未被满足的需求。你的分析要具体、有洞察力，避免泛泛而谈。只返回有效的 JSON 数组。" },
        { role: "user", content: fullPrompt },
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
    const cleaned = content.replace(/,?\s*\[(\d+)\]\s*/g, " ").replace(/\s+/g, " ");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      signals = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error(`[perplexity-scheduler] Failed to parse response for "${keyword}":`, e);
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

/**
 * 从 scan_jobs + user_topic_clicks + trending_topics 获取高优先级关键词
 */
async function collectKeywords(supabase: any): Promise<string[]> {
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

  return keywords.length === 0 ? [...SEED_KEYWORDS] : keywords;
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

  // 更新 trending_topics
  const allPainPoints: string[] = [];
  const allRelatedTags: string[] = [];
  let totalOpportunity = 0;
  let negativeCount = 0, positiveCount = 0, neutralCount = 0;

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

  const categoryMap: Record<string, string[]> = {
    "AI工具": ["AI", "ChatGPT", "人工智能", "AI工具", "AI绘画", "AI写作", "AI编程", "GPT", "Copilot"],
    "副业赚钱": ["副业", "赚钱", "兼职", "被动收入", "变现", "知识付费"],
    "电商创业": ["电商", "跨境", "独立站", "直播带货", "代发", "Shopify", "亚马逊", "拼多多"],
    "教育培训": ["在线教育", "培训", "课程", "考证", "技能", "付费社群"],
    "健康生活": ["减肥", "健身", "睡眠", "心理", "养生", "保健", "私教", "冥想"],
    "数字游民": ["远程", "自由职业", "数字游民", "在线创业", "海外接单", "远程协作"],
    "宠物经济": ["宠物", "萌宠", "猫", "狗", "宠物食品", "宠物医疗"],
    "个人IP": ["个人品牌", "短视频", "小红书", "知乎", "播客", "自媒体", "博主"],
    "SaaS/开发": ["独立开发", "SaaS", "低代码", "开源", "API", "开发者工具"],
    "银发经济": ["老年", "适老化", "养老", "银发", "退休"],
    "个人成长": ["时间管理", "自律", "效率", "学习", "职场"],
  };
  let category = "用户关注";
  for (const [cat, words] of Object.entries(categoryMap)) {
    if (words.some(w => keyword.includes(w))) { category = cat; break; }
  }

  const trendingData = {
    keyword,
    category,
    heat_score: Math.min(100, Math.round(avgHeat)),
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
    console.log(`[perplexity-scheduler] Daily quota: ${quota.used}/${DAILY_QUOTA} used`);
    if (quota.remaining <= 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Daily quota exhausted", used: quota.used }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 收集关键词
    const allKeywords = await collectKeywords(supabase);
    console.log(`[perplexity-scheduler] Collected ${allKeywords.length} candidate keywords`);

    // 3. 去重
    const recentlyScanned = await getRecentlyScannedKeywords(supabase);
    const freshKeywords = allKeywords.filter(kw => !recentlyScanned.has(kw.toLowerCase()));

    const keywordsToScan = freshKeywords.length > 0
      ? freshKeywords.slice(0, MAX_KEYWORDS_PER_RUN)
      : SEED_KEYWORDS.filter(kw => !recentlyScanned.has(kw.toLowerCase())).slice(0, MAX_KEYWORDS_PER_RUN);

    if (keywordsToScan.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All keywords recently scanned", quota_used: quota.used }),
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
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[perplexity-scheduler] Error for "${keyword}":`, msg);
        errors.push(`${keyword}: ${msg}`);
      }
    }

    // 5. 更新 scan_jobs
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

    // 6. 自动触发 signal-processor，让 niche_opportunities 也自动更新
    if (totalInserted > 0) {
      try {
        console.log(`[perplexity-scheduler] Auto-triggering signal-processor...`);
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
        console.log(`[perplexity-scheduler] signal-processor response: ${spResponse.status}`);
      } catch (e) {
        console.error(`[perplexity-scheduler] Failed to trigger signal-processor:`, e);
      }
    }

    console.log(`[perplexity-scheduler] Done: ${totalInserted} signals, ${trendingUpdated} trending updated`);

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
