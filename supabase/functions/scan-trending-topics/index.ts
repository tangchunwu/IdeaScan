import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePool } from "../_shared/config-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Seed keywords for different categories - extend this list over time
const SEED_KEYWORDS_BY_CATEGORY: Record<string, string[]> = {
  "AI工具": ["AI副业", "ChatGPT赚钱", "AI写作工具", "AI绘画变现", "AI视频剪辑"],
  "副业赚钱": ["副业推荐", "在家赚钱", "兼职项目", "被动收入", "自媒体变现"],
  "个人成长": ["时间管理", "自律养成", "提升效率", "学习方法", "职场技能"],
  "健康生活": ["减肥食谱", "健身入门", "睡眠改善", "心理健康", "养生方法"],
  "数字游民": ["远程办公", "自由职业", "海外工作", "数字游民", "在线创业"],
};

interface TrendingTopicData {
  keyword: string;
  category: string;
  heat_score: number;
  growth_rate: number | null;
  sample_count: number;
  avg_engagement: number;
  sentiment_positive: number;
  sentiment_negative: number;
  sentiment_neutral: number;
  top_pain_points: string[];
  related_keywords: string[];
  sources: { platform: string; count: number }[];
  // 新增: 缓存评论用于验证加速
  comments?: { content: string; user_nickname?: string; platform?: string }[];
}

interface CrawlResult {
  success: boolean;
  platform: string;
  totalPosts: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  comments: { content: string; user_nickname?: string }[];
  relatedTags: string[];
}

/**
 * Crawl Xiaohongshu using Tikhub API
 */
async function crawlXiaohongshu(keyword: string, tikhubToken: string): Promise<CrawlResult> {
  const emptyResult: CrawlResult = {
    success: false,
    platform: 'xiaohongshu',
    totalPosts: 0,
    avgLikes: 0,
    avgComments: 0,
    avgCollects: 0,
    comments: [],
    relatedTags: [],
  };
  
  try {
    const searchUrl = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(keyword)}&page=1&sort=general&note_type=0`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${tikhubToken}` },
    });
    
    if (!response.ok) {
      console.warn(`[XHS] Search failed: ${response.status}`);
      return emptyResult;
    }
    
    const data = await response.json();
    const payload = data?.data?.data || data?.data || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const notes = items.map((item: any) => item?.note || item);
    
    if (notes.length === 0) return emptyResult;
    
    let totalLikes = 0;
    let totalComments = 0;
    let totalCollects = 0;
    const allComments: { content: string; user_nickname?: string }[] = [];
    const relatedTags: string[] = [];
    
    for (const note of notes) {
      totalLikes += note.liked_count || 0;
      totalComments += note.comments_count || note.comment_count || 0;
      totalCollects += note.collected_count || 0;
      
      // Extract hashtags from title/desc
      const text = (note.title || "") + " " + (note.desc || "");
      const tags = text.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
      for (const tag of tags) {
        const cleanTag = tag.replace("#", "");
        if (cleanTag !== keyword && !relatedTags.includes(cleanTag)) {
          relatedTags.push(cleanTag);
        }
      }
    }
    
    // Fetch a few comments
    if (notes.length > 0) {
      try {
        const noteId = notes[0].id || notes[0].note_id;
        if (noteId) {
          const commentsUrl = `https://api.tikhub.io/api/v1/xiaohongshu/web/get_note_comments?note_id=${noteId}&cursor=`;
          const commentsRes = await fetch(commentsUrl, {
            headers: { Authorization: `Bearer ${tikhubToken}` },
          });
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json();
            const commentsList = commentsData?.data?.data?.comments || commentsData?.data?.comments || [];
            for (const c of commentsList.slice(0, 10)) {
              allComments.push({
                content: c.content || "",
                user_nickname: c.user?.nickname || c.user_info?.nickname,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[XHS] Comments fetch failed:", e);
      }
    }
    
    return {
      success: true,
      platform: 'xiaohongshu',
      totalPosts: Math.max(Number(payload.total || 0), notes.length),
      avgLikes: notes.length > 0 ? Math.round(totalLikes / notes.length) : 0,
      avgComments: notes.length > 0 ? Math.round(totalComments / notes.length) : 0,
      avgCollects: notes.length > 0 ? Math.round(totalCollects / notes.length) : 0,
      comments: allComments,
      relatedTags: relatedTags.slice(0, 10),
    };
  } catch (e) {
    console.error("[XHS] Crawl error:", e);
    return emptyResult;
  }
}

/**
 * Crawl Douyin using Tikhub API
 */
async function crawlDouyin(keyword: string, tikhubToken: string): Promise<CrawlResult> {
  const emptyResult: CrawlResult = {
    success: false,
    platform: 'douyin',
    totalPosts: 0,
    avgLikes: 0,
    avgComments: 0,
    avgCollects: 0,
    comments: [],
    relatedTags: [],
  };
  
  try {
    const searchUrl = `https://api.tikhub.io/api/v1/douyin/web/fetch_video_search_result?keyword=${encodeURIComponent(keyword)}&count=5&offset=0&sort_type=0`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${tikhubToken}` },
    });
    
    if (!response.ok) {
      console.warn(`[Douyin] Search failed: ${response.status}`);
      return emptyResult;
    }
    
    const data = await response.json();
    const payload = data?.data?.data || data?.data || {};
    const awemeList = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload.aweme_list)
        ? payload.aweme_list
        : (Array.isArray(payload.data) ? payload.data : []));
    const videos = awemeList.map((item: any) => item?.aweme_info || item);
    
    if (videos.length === 0) return emptyResult;
    
    let totalLikes = 0;
    let totalComments = 0;
    const allComments: { content: string; user_nickname?: string }[] = [];
    const relatedTags: string[] = [];
    
    for (const video of videos) {
      const stats = video.statistics || {};
      totalLikes += stats.digg_count || 0;
      totalComments += stats.comment_count || 0;
      
      // Extract hashtags
      const challenges = video.text_extra || [];
      for (const c of challenges) {
        if (c.hashtag_name && c.hashtag_name !== keyword && !relatedTags.includes(c.hashtag_name)) {
          relatedTags.push(c.hashtag_name);
        }
      }
    }
    
    // Fetch comments from first video
    if (videos.length > 0) {
      try {
        const awemeId = videos[0].aweme_id;
        if (awemeId) {
          const commentsUrl = `https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments?aweme_id=${awemeId}&count=10&cursor=0`;
          const commentsRes = await fetch(commentsUrl, {
            headers: { Authorization: `Bearer ${tikhubToken}` },
          });
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json();
            const commentsList = commentsData?.data?.data?.comments || commentsData?.data?.comments || [];
            for (const c of commentsList.slice(0, 10)) {
              allComments.push({
                content: c.text || "",
                user_nickname: c.user?.nickname,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[Douyin] Comments fetch failed:", e);
      }
    }
    
    return {
      success: true,
      platform: 'douyin',
      totalPosts: videos.length,
      avgLikes: videos.length > 0 ? Math.round(totalLikes / videos.length) : 0,
      avgComments: videos.length > 0 ? Math.round(totalComments / videos.length) : 0,
      avgCollects: 0,
      comments: allComments,
      relatedTags: relatedTags.slice(0, 10),
    };
  } catch (e) {
    console.error("[Douyin] Crawl error:", e);
    return emptyResult;
  }
}

/**
 * Calculate heat score based on engagement metrics
 */
function calculateHeatScore(
  totalPosts: number,
  avgLikes: number,
  avgComments: number,
  avgCollects: number
): number {
  const engagementScore = (avgLikes * 1) + (avgComments * 2) + (avgCollects * 1.5);
  const volumeScore = Math.min(totalPosts * 10, 500);
  const rawScore = volumeScore + (engagementScore / 10);
  return Math.min(100, Math.round(rawScore / 10));
}

/**
 * Extract pain points from comments
 */
function extractPainPoints(comments: { content: string }[]): string[] {
  const painPhrases = [
    "太难了", "怎么办", "求助", "不知道", "困扰", "烦恼", "问题是",
    "想要", "需要", "希望", "如果能", "要是", "有没有"
  ];
  
  const painPoints: string[] = [];
  
  for (const comment of comments.slice(0, 50)) {
    const content = comment.content || "";
    for (const phrase of painPhrases) {
      if (content.includes(phrase) && content.length < 100 && content.length > 5) {
        painPoints.push(content.slice(0, 80));
        break;
      }
    }
    if (painPoints.length >= 5) break;
  }
  
  return painPoints;
}

/**
 * Analyze sentiment from comments
 */
function analyzeSentiment(comments: { content: string }[]): { positive: number; negative: number; neutral: number } {
  const positiveWords = ["好用", "推荐", "喜欢", "棒", "赞", "有用", "感谢", "太好了", "真的好"];
  const negativeWords = ["差", "坑", "失望", "不好", "难用", "垃圾", "骗", "不值", "后悔"];
  
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  for (const comment of comments) {
    const content = comment.content || "";
    const hasPositive = positiveWords.some(w => content.includes(w));
    const hasNegative = negativeWords.some(w => content.includes(w));
    
    if (hasPositive && !hasNegative) positive++;
    else if (hasNegative && !hasPositive) negative++;
    else neutral++;
  }
  
  const total = positive + negative + neutral || 1;
  return {
    positive: Math.round((positive / total) * 100),
    negative: Math.round((negative / total) * 100),
    neutral: Math.round((neutral / total) * 100),
  };
}

/**
 * Scan a single keyword across platforms
 */
async function scanKeyword(
  keyword: string,
  category: string,
  tikhubToken?: string
): Promise<TrendingTopicData | null> {
  console.log(`[Scan] Scanning keyword: ${keyword} (${category})`);
  if (!tikhubToken) {
    console.log(`[Scan] Skip keyword ${keyword}: TikHub token unavailable`);
    return null;
  }
  
  // Global policy: Douyin crawl is disabled, only crawl Xiaohongshu.
  const xhsResult = await crawlXiaohongshu(keyword, tikhubToken);
  const validResults = [xhsResult].filter(r => r.success);
  
  if (validResults.length === 0) {
    console.log(`[Scan] No valid results for ${keyword}`);
    return null;
  }
  
  // Aggregate data from all platforms
  let totalPosts = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalCollects = 0;
  const allComments: { content: string }[] = [];
  const sources: { platform: string; count: number }[] = [];
  const allRelatedTags: string[] = [];
  
  for (const result of validResults) {
    totalPosts += result.totalPosts;
    totalLikes += result.avgLikes * result.totalPosts;
    totalComments += result.avgComments * result.totalPosts;
    totalCollects += result.avgCollects * result.totalPosts;
    allComments.push(...result.comments);
    sources.push({ platform: result.platform, count: result.totalPosts });
    
    for (const tag of result.relatedTags) {
      if (!allRelatedTags.includes(tag)) allRelatedTags.push(tag);
    }
  }
  
  const avgLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;
  const avgComments = totalPosts > 0 ? Math.round(totalComments / totalPosts) : 0;
  const avgCollects = totalPosts > 0 ? Math.round(totalCollects / totalPosts) : 0;
  
  const heatScore = calculateHeatScore(totalPosts, avgLikes, avgComments, avgCollects);
  const sentiment = analyzeSentiment(allComments);
  const painPoints = extractPainPoints(allComments);
  
  return {
    keyword,
    category,
    heat_score: heatScore,
    growth_rate: null,
    sample_count: totalPosts,
    avg_engagement: avgLikes + avgComments + avgCollects,
    sentiment_positive: sentiment.positive,
    sentiment_negative: sentiment.negative,
    sentiment_neutral: sentiment.neutral,
    top_pain_points: painPoints,
    related_keywords: allRelatedTags.slice(0, 10),
    sources,
    // 保存评论用于缓存加速
    comments: allComments.slice(0, 30).map((c, i) => ({
      ...c,
      platform: validResults[i % validResults.length]?.platform || 'unknown'
    })),
  };
}

/**
 * Get high-priority keywords from user behavior data
 */
async function getHighPriorityKeywords(supabase: any): Promise<string[]> {
  try {
    // Get keywords that users have validated or frequently clicked
    const { data: topKeywords, error } = await supabase
      .from('user_topic_clicks')
      .select('keyword')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[Scan] Failed to fetch user keywords:', error);
      return [];
    }

    // Count keyword frequency
    const keywordCounts = new Map<string, number>();
    for (const row of topKeywords || []) {
      if (row.keyword) {
        keywordCounts.set(row.keyword, (keywordCounts.get(row.keyword) || 0) + 1);
      }
    }

    // Get related keywords from trending topics with high validation_count
    const { data: hotTopics } = await supabase
      .from('trending_topics')
      .select('keyword, related_keywords, validation_count')
      .gt('validation_count', 0)
      .order('validation_count', { ascending: false })
      .limit(10);

    const dynamicKeywords: string[] = [];
    for (const topic of hotTopics || []) {
      // Add the main keyword
      if (topic.keyword && !dynamicKeywords.includes(topic.keyword)) {
        dynamicKeywords.push(topic.keyword);
      }
      // Add related keywords
      for (const related of topic.related_keywords || []) {
        if (!dynamicKeywords.includes(related)) {
          dynamicKeywords.push(related);
        }
      }
    }

    // Add frequently clicked keywords
    const sortedUserKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);

    for (const kw of sortedUserKeywords) {
      if (!dynamicKeywords.includes(kw)) {
        dynamicKeywords.push(kw);
      }
    }

    console.log(`[Scan] Found ${dynamicKeywords.length} dynamic keywords from user behavior`);
    return dynamicKeywords.slice(0, 20);
  } catch (e) {
    console.error('[Scan] Error fetching dynamic keywords:', e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // TikHub token is user-only (configured via frontend settings).
    // scan-trending-topics is a system job that cannot use user tokens,
    // so it should rely on cached data or skip social crawling.
    const tikhubToken: string | undefined = undefined;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json().catch(() => ({}));
    const { categories, maxPerCategory = 2, includeDynamicKeywords = true } = body;

    if (!tikhubToken) {
      // TikHub 不可用时，使用搜索 LLM 池作为回退
      const searchPool = await resolvePool("search_llm");
      const searchProvider = searchPool[0];

      if (!searchProvider) {
        return new Response(
          JSON.stringify({ success: true, added: 0, message: "Neither TikHub nor search LLM available; skipped scanning" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const perplexityBaseUrl = searchProvider.base_url;
      const perplexityApiKey = searchProvider.api_key;

      console.log("[Scan] TikHub unavailable, using Perplexity fallback");

      // 用 Perplexity 扫描种子关键词
      const categoriesToScanFallback = categories && Array.isArray(categories)
        ? categories.filter((c: string) => SEED_KEYWORDS_BY_CATEGORY[c])
        : Object.keys(SEED_KEYWORDS_BY_CATEGORY);

      const fallbackTopics: TrendingTopicData[] = [];

      // 每个 category 取 1 个关键词，最多 3 个
      const fallbackKeywords: { keyword: string; category: string }[] = [];
      for (const cat of categoriesToScanFallback) {
        const kws = SEED_KEYWORDS_BY_CATEGORY[cat] || [];
        if (kws.length > 0) {
          fallbackKeywords.push({ keyword: kws[Math.floor(Math.random() * kws.length)], category: cat });
        }
        if (fallbackKeywords.length >= 3) break;
      }

      // 加入动态关键词
      if (includeDynamicKeywords) {
        const dynamicKws = await getHighPriorityKeywords(supabase);
        for (const kw of dynamicKws.slice(0, 2)) {
          if (!fallbackKeywords.some(f => f.keyword === kw)) {
            fallbackKeywords.push({ keyword: kw, category: "用户关注" });
          }
        }
      }

      for (const { keyword: kw, category: cat } of fallbackKeywords.slice(0, 5)) {
        try {
          console.log(`[Scan/Perplexity] Scanning: ${kw} (${cat})`);
          const prompt = `搜索"${kw}"的最新热度趋势。分析用户讨论量、痛点和情感倾向。
返回 JSON 对象：
{
  "heat_estimate": 0-100的热度估计,
  "pain_points": ["痛点1", "痛点2"],
  "related_tags": ["标签1", "标签2"],
  "positive_ratio": 0-100,
  "negative_ratio": 0-100,
  "neutral_ratio": 0-100,
  "discussion_volume": "high/medium/low"
}
只返回 JSON，不要其他文字。`;

          const response = await fetch(`${perplexityBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${perplexityApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              temperature: 0.3,
              messages: [
                { role: "system", content: "你是趋势分析师。返回有效 JSON。" },
                { role: "user", content: prompt },
              ],
            }),
          });

          if (!response.ok) {
            console.warn(`[Scan/Perplexity] API error for "${kw}": ${response.status}`);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content ?? "";
          const citations: string[] = data.citations ?? [];

          let parsed: any = {};
          try {
            const cleaned = content.replace(/,?\s*\[(\d+)\]\s*/g, " ").replace(/\s+/g, " ");
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
          } catch { /* ignore parse errors */ }

          const heatScore = Math.min(100, Math.max(0, parsed.heat_estimate || 30));
          if (heatScore >= 15) {
            fallbackTopics.push({
              keyword: kw,
              category: cat,
              heat_score: heatScore,
              growth_rate: null,
              sample_count: parsed.discussion_volume === "high" ? 100 : parsed.discussion_volume === "medium" ? 50 : 20,
              avg_engagement: heatScore,
              sentiment_positive: parsed.positive_ratio || 40,
              sentiment_negative: parsed.negative_ratio || 20,
              sentiment_neutral: parsed.neutral_ratio || 40,
              top_pain_points: (parsed.pain_points || []).slice(0, 5),
              related_keywords: (parsed.related_tags || []).slice(0, 10),
              sources: [{ platform: "perplexity", count: citations.length || 1 }],
            });
          }

          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.error(`[Scan/Perplexity] Error for "${kw}":`, e);
        }
      }

      // Upsert fallback topics
      if (fallbackTopics.length > 0) {
        const upsertData = fallbackTopics.map(t => ({
          keyword: t.keyword,
          category: t.category,
          heat_score: t.heat_score,
          growth_rate: t.growth_rate,
          sample_count: t.sample_count,
          avg_engagement: t.avg_engagement,
          sentiment_positive: t.sentiment_positive,
          sentiment_negative: t.sentiment_negative,
          sentiment_neutral: t.sentiment_neutral,
          top_pain_points: t.top_pain_points,
          related_keywords: t.related_keywords,
          sources: t.sources,
          source_type: "perplexity_fallback",
          is_active: true,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          last_crawled_at: new Date().toISOString(),
          cache_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("trending_topics")
          .upsert(upsertData, { onConflict: "keyword" });

        if (upsertError) {
          console.error("[Scan/Perplexity] Upsert error:", upsertError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          added: fallbackTopics.length,
          source: "perplexity_fallback",
          topics: fallbackTopics.map(t => ({ keyword: t.keyword, heat_score: t.heat_score })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Determine which categories to scan
    const categoriesToScan = categories && Array.isArray(categories)
      ? categories.filter((c: string) => SEED_KEYWORDS_BY_CATEGORY[c])
      : Object.keys(SEED_KEYWORDS_BY_CATEGORY);
    
    console.log(`[Scan] Starting scan for categories: ${categoriesToScan.join(", ")}`);
    
    // Get dynamic keywords from user behavior
    let dynamicKeywords: string[] = [];
    if (includeDynamicKeywords) {
      dynamicKeywords = await getHighPriorityKeywords(supabase);
    }
    
    const newTopics: TrendingTopicData[] = [];
    
    // Scan seed keywords by category
    for (const category of categoriesToScan) {
      const keywords = SEED_KEYWORDS_BY_CATEGORY[category] || [];
      const selectedKeywords = keywords.slice(0, maxPerCategory);
      
      for (const keyword of selectedKeywords) {
        try {
          const topicData = await scanKeyword(keyword, category, tikhubToken);
          if (topicData && topicData.heat_score >= 15) {
            newTopics.push(topicData);
          }
          
          // Rate limiting between requests
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`[Scan] Error scanning ${keyword}:`, e);
        }
      }
    }
    
    // Scan dynamic keywords from user behavior
    if (dynamicKeywords.length > 0) {
      console.log(`[Scan] Scanning ${dynamicKeywords.length} dynamic keywords from user behavior`);
      for (const keyword of dynamicKeywords.slice(0, 5)) { // Limit to 5 dynamic keywords per scan
        try {
          const topicData = await scanKeyword(keyword, "用户关注", tikhubToken);
          if (topicData && topicData.heat_score >= 10) { // Lower threshold for user-driven keywords
            newTopics.push(topicData);
          }
          
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`[Scan] Error scanning dynamic keyword ${keyword}:`, e);
        }
      }
    }
    
    console.log(`[Scan] Found ${newTopics.length} trending topics`);
    
    if (newTopics.length === 0) {
      return new Response(
        JSON.stringify({ success: true, added: 0, message: "No qualifying topics found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Upsert topics with cache data (update if keyword exists, insert if new)
    const upsertData = newTopics.map(t => ({
      keyword: t.keyword,
      category: t.category,
      heat_score: t.heat_score,
      growth_rate: t.growth_rate,
      sample_count: t.sample_count,
      avg_engagement: t.avg_engagement,
      sentiment_positive: t.sentiment_positive,
      sentiment_negative: t.sentiment_negative,
      sentiment_neutral: t.sentiment_neutral,
      top_pain_points: t.top_pain_points,
      related_keywords: t.related_keywords,
      sources: t.sources,
      is_active: true,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      // 新增: 缓存社媒数据用于验证流程加速
      cached_social_data: {
        comments: (t as any).comments || [],
        totalPosts: t.sample_count,
        avgLikes: Math.round(t.avg_engagement / 3),
        avgComments: Math.round(t.avg_engagement / 3),
        avgCollects: Math.round(t.avg_engagement / 3),
      },
      cache_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      last_crawled_at: new Date().toISOString(),
    }));
    
    const { error: upsertError } = await supabase
      .from("trending_topics")
      .upsert(upsertData, { onConflict: 'keyword' });
    
    if (upsertError) {
      console.error("[Scan] Error upserting topics:", upsertError);
      throw upsertError;
    }
    
    console.log(`[Scan] Successfully upserted ${newTopics.length} topics`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        added: newTopics.length,
        dynamicKeywordsUsed: dynamicKeywords.length,
        topics: newTopics.map(t => ({ keyword: t.keyword, heat_score: t.heat_score }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[Scan] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
