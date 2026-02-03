/**
 * Non-Streaming Validation Edge Function
 * 
 * 已同步流式版本的优化:
 * - Jina Reader 网页清洗
 * - 分层摘要系统
 * - 竞品名称提取 + 二次深度搜索
 * - 热门话题缓存
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { searchCompetitors, SearchResult } from "./search.ts";
import { expandKeywords, ExpandedKeywords } from "./keyword-expander.ts";
import { summarizeRawData, DataSummary } from "./data-summarizer.ts";
// New multi-channel adapter architecture
import {
  crawlXiaohongshu,
  crawlDouyin,
  toLegacyXhsFormat,
  toLegacyDouyinFormat,
  type ChannelCrawlResult
} from "./channels/index.ts";
import {
  validateString,
  validateStringArray,
  validateUserProvidedUrl,
  sanitizeForPrompt,
  ValidationError,
  createErrorResponse,
  LIMITS
} from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";
// 新增优化模块
import { cleanCompetitorPages, isCleanableUrl } from "../_shared/jina-reader.ts";
import { summarizeBatch, aggregateSummaries, type SummaryConfig } from "../_shared/summarizer.ts";
import { 
  extractCompetitorNames, 
  searchCompetitorDetails, 
  mergeSearchResults,
  type LLMConfig 
} from "../_shared/competitor-extractor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestConfig {
  llmProvider?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  tikhubToken?: string;
  enableXiaohongshu?: boolean;
  enableDouyin?: boolean;
  searchKeys?: {
    bocha?: string;
    you?: string;
    tavily?: string;
  };
  mode?: 'quick' | 'deep';
}

/**
 * Validate and sanitize the request config
 */
function validateConfig(config: unknown): RequestConfig {
  if (!config || typeof config !== "object") {
    return {};
  }

  const c = config as Record<string, unknown>;

  return {
    llmProvider: validateString(c.llmProvider, "llmProvider", LIMITS.MODEL_MAX_LENGTH) || undefined,
    llmBaseUrl: validateUserProvidedUrl(c.llmBaseUrl, "llmBaseUrl") || undefined,
    llmApiKey: validateString(c.llmApiKey, "llmApiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    llmModel: validateString(c.llmModel, "llmModel", LIMITS.MODEL_MAX_LENGTH) || undefined,
    tikhubToken: validateString(c.tikhubToken, "tikhubToken", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    enableXiaohongshu: typeof c.enableXiaohongshu === 'boolean' ? c.enableXiaohongshu : true,
    enableDouyin: typeof c.enableDouyin === 'boolean' ? c.enableDouyin : false,
    searchKeys: c.searchKeys && typeof c.searchKeys === "object" ? {
      bocha: validateString((c.searchKeys as any).bocha, "bocha key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      you: validateString((c.searchKeys as any).you, "you key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      tavily: validateString((c.searchKeys as any).tavily, "tavily key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    } : undefined,
    mode: (c.mode === 'quick' || c.mode === 'deep') ? (c.mode as 'quick' | 'deep') : undefined,
  };
}

function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;

  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;

  return cleaned.slice(first, last + 1);
}

function repairJson(json: string): string {
  let repaired = json;
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");
  repaired = repaired.replace(/\](\s+)\[/g, "],$1[");
  repaired = repaired.replace(/\](\s+)\{/g, "],$1{");
  repaired = repaired.replace(/\](\s+)"/g, "],$1\"");
  repaired = repaired.replace(/\}(\s+)\{/g, "},$1{");
  repaired = repaired.replace(/\}(\s+)"/g, "},$1\"");
  repaired = repaired.replace(/"(\s*\n\s*)"/g, "\",$1\"");
  repaired = repaired.replace(/\](\s*\n\s*)"([a-zA-Z_])/g, "],$1\"$2");
  return repaired;
}

function completeTruncatedJson(json: string): string {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escape) { escape = false; continue; }
    if (char === '\\' && inString) { escape = true; continue; }
    if (char === '"' && !escape) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  let completed = json;
  if (inString) completed += '"';
  completed = completed.replace(/,\s*"[^"]*":\s*("[^"]*)?$/g, '');
  completed = completed.replace(/,\s*"[^"]*":\s*\[?\s*$/g, '');
  for (let i = 0; i < openBrackets; i++) completed += ']';
  for (let i = 0; i < openBraces; i++) completed += '}';
  return completed;
}

function parseJsonFromModelOutput<T = unknown>(text: string): T {
  const json = extractFirstJsonObject(text);
  if (!json) {
    console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
    throw new Error("AI did not return valid JSON");
  }

  try {
    return JSON.parse(json) as T;
  } catch (_firstError) {
    const repaired = repairJson(json);
    try {
      return JSON.parse(repaired) as T;
    } catch (_secondError) {
      const completed = completeTruncatedJson(repaired);
      try {
        console.log("Attempting to parse completed JSON...");
        return JSON.parse(completed) as T;
      } catch (_thirdError) {
        console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
        throw new Error("Analysis processing failed. Please try again.");
      }
    }
  }
}

type KeywordExtractionResult = {
  xhsKeywords: string[];
  webQueries: string[];
  expanded?: ExpandedKeywords;
};

type AIResult = {
  overallScore: number;
  overallVerdict?: string;
  marketAnalysis: Record<string, unknown>;
  sentimentAnalysis: Record<string, unknown>;
  aiAnalysis: Record<string, unknown>;
  persona: Record<string, unknown>;
  dimensions: Array<{ dimension: string; score: number; reason?: string }>;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: unknown[];
  risks?: string[];
};

/**
 * Crawl social media data using the multi-channel adapter architecture
 * Supports: Xiaohongshu, Douyin
 * Future: Weibo, Bilibili
 */
async function crawlSocialMediaData(
  idea: string,
  tags: string[],
  tikhubToken?: string,
  mode: 'quick' | 'deep' = 'quick',
  enableXiaohongshu: boolean = true,
  enableDouyin: boolean = false
) {
  const token = tikhubToken || Deno.env.get("TIKHUB_TOKEN");

  const emptyResult = {
    totalNotes: 0,
    avgLikes: 0,
    avgComments: 0,
    avgCollects: 0,
    totalEngagement: 0,
    weeklyTrend: [],
    contentTypes: [],
    sampleNotes: [],
    sampleComments: []
  };

  if (!token) {
    console.log("No Tikhub token configured, skipping social media data");
    return emptyResult;
  }

  // Must have at least one platform enabled
  if (!enableXiaohongshu && !enableDouyin) {
    console.log("No social media platform enabled, skipping social media data");
    return emptyResult;
  }

  try {
    console.log(`[Multi-Channel] Crawling with mode: ${mode}, platforms: XHS=${enableXiaohongshu}, DY=${enableDouyin}`);

    const results: ChannelCrawlResult[] = [];
    const crawlPromises: Promise<ChannelCrawlResult>[] = [];

    // Crawl enabled platforms in parallel
    if (enableXiaohongshu) {
      crawlPromises.push(
        crawlXiaohongshu(idea, { auth_token: token, mode }, tags)
          .catch(e => {
            console.error("[Multi-Channel] Xiaohongshu crawl failed:", e);
            return { success: false, error: e.message, channel: 'xiaohongshu', posts: [], comments: [], stats: { total_posts: 0, total_comments: 0, avg_likes: 0, avg_comments: 0, avg_collects: 0, avg_shares: 0, total_engagement: 0, weekly_trend: [], content_types: [] } } as ChannelCrawlResult;
          })
      );
    }

    if (enableDouyin) {
      crawlPromises.push(
        crawlDouyin(idea, { auth_token: token, mode }, tags)
          .catch(e => {
            console.error("[Multi-Channel] Douyin crawl failed:", e);
            return { success: false, error: e.message, channel: 'douyin', posts: [], comments: [], stats: { total_posts: 0, total_comments: 0, avg_likes: 0, avg_comments: 0, avg_collects: 0, avg_shares: 0, total_engagement: 0, weekly_trend: [], content_types: [] } } as ChannelCrawlResult;
          })
      );
    }

    const crawlResults = await Promise.all(crawlPromises);

    // Merge results from all platforms
    let mergedResult = {
      totalNotes: 0,
      avgLikes: 0,
      avgComments: 0,
      avgCollects: 0,
      totalEngagement: 0,
      weeklyTrend: [] as { name: string; value: number }[],
      contentTypes: [] as { name: string; value: number }[],
      sampleNotes: [] as any[],
      sampleComments: [] as any[]
    };

    let successfulResults = 0;
    const contentTypeMap = new Map<string, number>();
    const weeklyTrendMap = new Map<string, number>();

    for (const result of crawlResults) {
      if (!result.success) {
        console.warn(`[Multi-Channel] ${result.channel} failed: ${result.error}`);
        continue;
      }

      successfulResults++;

      // Handle different return types for different platforms
      if (result.channel === 'douyin') {
        const douyinLegacy = toLegacyDouyinFormat(result);

        // Aggregate stats
        mergedResult.totalNotes += douyinLegacy.totalVideos || 0;
        mergedResult.avgLikes += douyinLegacy.avgLikes || 0;
        mergedResult.avgComments += douyinLegacy.avgComments || 0;
        mergedResult.totalEngagement += douyinLegacy.totalEngagement || 0;

        // Merge sample content
        mergedResult.sampleNotes.push(...(douyinLegacy.sampleVideos || []).map((v: any) => ({
          ...v,
          title: '[抖音] ' + (v.desc || '').slice(0, 30),
          desc: v.desc,
          note_id: v.aweme_id,
          liked_count: v.digg_count,
          collected_count: v.collect_count,
          comments_count: v.comment_count,
          shared_count: v.share_count,
          user_nickname: v.author_nickname,
          _platform: 'douyin'
        })));
        mergedResult.sampleComments.push(...(douyinLegacy.sampleComments || []).map((c: any) => ({
          ...c,
          content: c.text,
          comment_id: c.cid,
          like_count: c.digg_count,
          ip_location: c.ip_label,
          _platform: 'douyin'
        })));

        // Merge content types and weekly trends
        for (const ct of douyinLegacy.contentTypes || []) {
          const existing = contentTypeMap.get(ct.name) || 0;
          contentTypeMap.set(ct.name, existing + ct.value);
        }
        for (const wt of douyinLegacy.weeklyTrend || []) {
          const existing = weeklyTrendMap.get(wt.name) || 0;
          weeklyTrendMap.set(wt.name, existing + wt.value);
        }
      } else {
        const xhsLegacy = toLegacyXhsFormat(result);

        // Aggregate stats
        mergedResult.totalNotes += xhsLegacy.totalNotes || 0;
        mergedResult.avgLikes += xhsLegacy.avgLikes || 0;
        mergedResult.avgComments += xhsLegacy.avgComments || 0;
        mergedResult.avgCollects += xhsLegacy.avgCollects || 0;
        mergedResult.totalEngagement += xhsLegacy.totalEngagement || 0;

        // Merge sample content
        mergedResult.sampleNotes.push(...(xhsLegacy.sampleNotes || []).map((n: any) => ({
          ...n,
          title: '[小红书] ' + (n.title || ''),
          _platform: 'xiaohongshu'
        })));
        mergedResult.sampleComments.push(...(xhsLegacy.sampleComments || []).map((c: any) => ({
          ...c,
          _platform: 'xiaohongshu'
        })));

        // Merge content types and weekly trends
        for (const ct of xhsLegacy.contentTypes || []) {
          const existing = contentTypeMap.get(ct.name) || 0;
          contentTypeMap.set(ct.name, existing + ct.value);
        }
        for (const wt of xhsLegacy.weeklyTrend || []) {
          const existing = weeklyTrendMap.get(wt.name) || 0;
          weeklyTrendMap.set(wt.name, existing + wt.value);
        }
      }
    }

    // Calculate averages if we have successful results
    if (successfulResults > 0) {
      mergedResult.avgLikes = Math.round(mergedResult.avgLikes / successfulResults);
      mergedResult.avgComments = Math.round(mergedResult.avgComments / successfulResults);
      mergedResult.avgCollects = Math.round(mergedResult.avgCollects / successfulResults);
    }

    // Convert maps to arrays
    mergedResult.contentTypes = Array.from(contentTypeMap.entries()).map(([name, value]) => ({ name, value }));
    mergedResult.weeklyTrend = Array.from(weeklyTrendMap.entries()).map(([name, value]) => ({ name, value }));

    // Limit sample sizes
    mergedResult.sampleNotes = mergedResult.sampleNotes.slice(0, 10);
    mergedResult.sampleComments = mergedResult.sampleComments.slice(0, 20);

    console.log(`[Multi-Channel] Merged ${successfulResults} platform(s): ${mergedResult.totalNotes} notes, ${mergedResult.sampleComments.length} comments`);

    return mergedResult;
  } catch (e) {
    console.error("[Multi-Channel] Crawl failed:", e);
    return emptyResult;
  }
}

async function extractKeywords(idea: string, tags: string[], config?: RequestConfig): Promise<KeywordExtractionResult> {
  // Always use system LLM configuration
  const apiKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
  const model = Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview";
  
  const result = await expandKeywords(idea, tags || [], {
    apiKey,
    baseUrl,
    model
  });

  console.log("Expanded keywords:", {
    core: result.expanded.coreKeywords,
    user: result.expanded.userPhrases,
    competitor: result.expanded.competitorQueries,
    trend: result.expanded.trendKeywords
  });

  return {
    xhsKeywords: result.xhsKeywords,
    webQueries: result.webQueries,
    expanded: result.expanded
  };
}

async function analyzeWithAI(
  idea: string,
  tags: string[],
  xiaohongshuData: any,
  competitorData: SearchResult[],
  dataSummary: DataSummary | null,
  config?: RequestConfig
): Promise<AIResult> {
  // Always use system LLM configuration
  const apiKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
  const model = Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview";

  let cleanBaseUrl = baseUrl.replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/chat/completions")) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
  }
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  // Sanitize inputs for prompt
  const sanitizedIdea = sanitizeForPrompt(idea);
  const sanitizedTags = tags.map(t => sanitizeForPrompt(t));

  const sampleNotesText = (xiaohongshuData.sampleNotes || [])
    .slice(0, 5)
    .map((n: any, i: number) => `${i + 1}. 标题: ${sanitizeForPrompt(n.title || "无")}\n   描述: ${sanitizeForPrompt((n.desc || "").slice(0, 100))}...\n   点赞: ${n.liked_count}, 收藏: ${n.collected_count}`)
    .join("\n");

  const sampleCommentsText = (xiaohongshuData.sampleComments || [])
    .slice(0, 10)
    .map((c: any) => `- "${sanitizeForPrompt((c.content || "").slice(0, 80))}..." (${sanitizeForPrompt(c.user_nickname || "")}, ${c.ip_location || "未知"})`)
    .join("\n");

  const competitorText = competitorData.length > 0
    ? competitorData.map((c, i) => `| ${i + 1} | ${sanitizeForPrompt(c.title.slice(0, 30))}... | ${sanitizeForPrompt(c.snippet.slice(0, 150))}... | ${c.source} |`).join("\n")
    : "未进行全网搜索或未找到相关竞品信息。";

  // Build enhanced context from data summary if available
  let dataSummarySection = "";
  if (dataSummary && dataSummary.dataQuality.score > 20) {
    const painPointsText = dataSummary.painPointClusters
      .slice(0, 5)
      .map(p => `- **${p.theme}** (${p.type}, 频次: ${p.frequency}): ${p.sampleQuotes.slice(0, 2).map(q => `"${q.slice(0, 50)}..."`).join("; ")}`)
      .join("\n");

    const competitorMatrixText = dataSummary.competitorMatrix
      .slice(0, 4)
      .map(c => `- **${c.category}** (${c.count}家): ${c.topPlayers.join(", ")}${c.commonPricing ? ` | 价格带: ${c.commonPricing}` : ""}`)
      .join("\n");

    const signalsText = dataSummary.marketSignals
      .slice(0, 3)
      .map(s => `- ${s.signal} (置信度: ${s.confidence}%): ${s.implication}`)
      .join("\n");

    dataSummarySection = `
  **来源C: 数据摘要（预处理结果，数据质量评分: ${dataSummary.dataQuality.score}/100）**
  
  **用户痛点聚类:**
  ${painPointsText || "暂无数据"}
  
  **竞品矩阵:**
  ${competitorMatrixText || "暂无数据"}
  
  **市场信号:**
  ${signalsText || "暂无数据"}
  
  **情感分布:** 正面 ${dataSummary.sentimentBreakdown.positive}% / 负面 ${dataSummary.sentimentBreakdown.negative}% / 中性 ${dataSummary.sentimentBreakdown.neutral}%
  
  **关键洞察:** ${dataSummary.keyInsights.join(" | ")}
  `;
  }

  const prompt = `你是一名**顶级VC基金的合伙人**（如红杉、高瓴）。你的任务是为内部投资委员会(IC)会议撰写一份**犀利、诚实、数据驱动的需求验证报告**。

  **待验证的创业想法**:
  - 想法描述: "${sanitizedIdea}"
  - 标签: ${sanitizedTags.join(", ")}

  ---
  **证据资料包（用这些数据支撑你的每一个评分）:**

  **来源A: 用户真实声音（小红书/社交媒体）**
  - 市场热度: 找到 ${xiaohongshuData.totalNotes} 条相关笔记
  - 互动数据: 平均 ${xiaohongshuData.avgLikes} 点赞, ${xiaohongshuData.avgComments} 评论
  
  ${sampleNotesText ? `**用户真实关注点（摘录）:**
  ${sampleNotesText}` : ""}
  
  ${sampleCommentsText ? `**用户真实吐槽/反馈:**
  ${sampleCommentsText}` : ""}

  **来源B: 竞品格局**
  | # | 竞品 | 摘要（价值主张） | 来源 |
  |---|---|---|---|
  ${competitorText}
  ${dataSummarySection}
  ---

  **你的任务:**
  分析以上证据，输出一份**严格JSON格式**的需求验证报告。

  **评分标准 (0-100):**
  - **90-100 (独角兽潜力)**: 垄断潜力、巨大且饥渴的市场、产品10倍优于现有方案
  - **70-89 (值得投资)**: 强劲增长、清晰护城河、良好的团队市场匹配
  - **40-69 (观察名单)**: 拥挤市场、差异化不明显、或小众需求
  - **0-39 (不推荐)**: "伪需求"、解决方案找问题、或存在致命缺陷

  **关键要求:**
  1. **残酷诚实**: 不要客气。如果是个烂主意就直说。如果市场拥挤（见来源B），点名批评。
  2. **引用证据**: 分析"市场需求"时，引用具体的小红书评论（来源A）。分析"竞争"时，点名具体竞品（来源B）。
  3. **禁止空话**: 不要说"优化用户体验"。要说"评论#3的用户抱怨价格太贵，所以降低获客成本是关键。"
  4. **全部中文**: 所有分析内容必须用中文输出，不要用英文。

  **仅输出合法JSON**（无markdown、无JSON外的解释文字）:
  {
    "overallScore": 0,
    "overallVerdict": "一句话犀利总结（如：'红海市场，缺乏护城河，不建议进入'）",
    "marketAnalysis": {
      "targetAudience": "具体用户画像（如：'一二线城市25-35岁白领女性'）",
      "marketSize": "市场规模估计或市场状态（如：'红海'、'蓝海'、'百亿级市场'）",
      "competitionLevel": "详细竞争分析，引用来源B的具体竞品",
      "trendDirection": "上升/下降/稳定",
      "keywords": ["高意向关键词1", "关键词2"]
    },
    "sentimentAnalysis": {
      "positive": 0,
      "neutral": 0,
      "negative": 0,
      "topPositive": ["来源A中的具体正面评价"],
      "topNegative": ["来源A中的具体负面吐槽"]
    },
    "aiAnalysis": {
      "feasibilityScore": 0,
      "strengths": ["独特优势1", "护城河2"],
      "weaknesses": ["致命缺陷1", "风险2"],
      "suggestions": [
        {
          "action": "具体可执行的行动",
          "reference": "参考案例（如：'Notion用PLG模式增长，无需销售团队'）",
          "expectedResult": "预期结果"
        }
      ],
      "risks": ["事前验尸风险1", "政策监管风险2"]
    },
    "persona": {
      "name": "用户画像名称（如：'焦虑的职场小白'）",
      "role": "职位/身份",
      "age": "年龄范围",
      "income": "收入水平",
      "painPoints": ["核心痛点1", "核心痛点2"],
      "goals": ["目标1", "目标2"],
      "techSavviness": 80,
      "spendingCapacity": 60,
      "description": "简短生动描述这类用户的日常生活和困扰"
    },
    "dimensions": [
      {"dimension": "需求痛感", "score": 0, "reason": "评分理由 - 引用来源A/B的具体证据"},
      {"dimension": "护城河", "score": 0, "reason": "评分理由 - 竞品有什么优势？"},
      {"dimension": "商业模式", "score": 0, "reason": "评分理由 - 变现是否可行？"},
      {"dimension": "技术可行性", "score": 0, "reason": "评分理由 - 有技术壁垒吗？"},
      {"dimension": "创新程度", "score": 0, "reason": "评分理由 - 真正的创新点是什么？"},
      {"dimension": "PMF潜力", "score": 0, "reason": "评分理由 - 市场真的需要这个吗？"}
    ]
  }`;

  console.log("Calling LLM for analysis...");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("AI Analysis failed:", text);
    throw new Error("Analysis service temporarily unavailable. Please try again.");
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";

  try {
    const parsed = parseJsonFromModelOutput<any>(content);

    // Log parsed structure for debugging
    console.log("Parsed AI result keys:", Object.keys(parsed));
    console.log("Parsed dimensions length:", Array.isArray(parsed.dimensions) ? parsed.dimensions.length : 'not array');
    console.log("Parsed persona:", parsed.persona ? 'exists' : 'null');

    // Validate and normalize the result
    const result: AIResult = {
      overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 0,
      overallVerdict: typeof parsed.overallVerdict === 'string' ? parsed.overallVerdict : undefined,
      marketAnalysis: parsed.marketAnalysis || {},
      sentimentAnalysis: parsed.sentimentAnalysis || {},
      aiAnalysis: parsed.aiAnalysis || {},
      persona: parsed.persona || {},
      dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    };

    return result;
  } catch (e) {
    console.error("AI JSON parse failed. Raw (first 1200 chars):", content.slice(0, 1200));
    throw e;
  }
}

/**
 * Sync validation results to trending_topics table for the Trending Radar feature
 * This automatically populates the discover page with validated market opportunities
 * 
 * Enhanced: Now tracks validation count, average score, and calculates quality score
 */
async function syncToTrendingTopics(
  supabase: any,
  idea: string,
  tags: string[],
  socialMediaData: any,
  dataSummary: DataSummary | null,
  aiResult: AIResult,
  userId: string,
  enableXiaohongshu?: boolean,
  enableDouyin?: boolean
): Promise<void> {
  // Calculate heat score based on engagement
  const totalEngagement = socialMediaData.totalEngagement || 0;
  const avgLikes = socialMediaData.avgLikes || 0;
  const avgComments = socialMediaData.avgComments || 0;
  const sampleCount = socialMediaData.totalNotes || 0;

  // Heat score calculation (0-100)
  const engagementScore = (avgLikes * 1) + (avgComments * 2);
  const volumeScore = Math.min(sampleCount * 10, 500);
  const heatScore = Math.min(100, Math.round((volumeScore + engagementScore / 10) / 10));

  // Extract keyword from idea (first tag or first 20 chars of idea)
  const keyword = tags[0] || idea.slice(0, 30).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").slice(0, 20) || idea.slice(0, 20);
  const category = tags.length > 1 ? tags[1] : null;

  // Get AI validation score
  const validationScore = aiResult.overallScore || 0;

  // Check if this topic already exists
  const { data: existingTopic } = await supabase
    .from("trending_topics")
    .select("id, validation_count, avg_validation_score, heat_score")
    .eq("keyword", keyword)
    .single();

  // Calculate new validation count and average score
  let newValidationCount = 1;
  let newAvgValidationScore = validationScore;
  let newHeatScore = heatScore;

  if (existingTopic) {
    // Accumulate validation data
    const oldCount = existingTopic.validation_count || 0;
    const oldAvgScore = existingTopic.avg_validation_score || 0;

    newValidationCount = oldCount + 1;
    // Calculate running average
    newAvgValidationScore = Math.round(((oldAvgScore * oldCount) + validationScore) / newValidationCount);
    // Take the higher heat score (topics can grow hotter)
    newHeatScore = Math.max(heatScore, existingTopic.heat_score || 0);

    console.log(`[TrendingSync] Updating existing topic: ${keyword} (validation #${newValidationCount})`);
  } else {
    // Only create new topics if heat score is meaningful (>= 20) or validation score is good (>= 50)
    if (heatScore < 20 && validationScore < 50) {
      console.log(`[TrendingSync] Skipping new topic - score too low: heat=${heatScore}, validation=${validationScore}`);
      return;
    }
    console.log(`[TrendingSync] Creating new topic: ${keyword}`);
  }

  // Determine confidence level based on validation count
  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  if (newValidationCount >= 3) {
    confidenceLevel = 'high';
  } else if (newValidationCount >= 1) {
    confidenceLevel = 'medium';
  }

  // Calculate quality score: heat(40%) + validation(30%) + count_bonus(20%) + freshness(10%)
  const countBonus = Math.min(newValidationCount * 10, 100); // Max 100 for 10+ validations
  const freshnessScore = 100; // New/updated topics get full freshness
  const qualityScore = Math.round(
    (newHeatScore * 0.4) +
    (newAvgValidationScore * 0.3) +
    (countBonus * 0.2) +
    (freshnessScore * 0.1)
  );

  // Extract pain points from data summary
  const topPainPoints = dataSummary?.painPointClusters?.slice(0, 5).map(p => p.theme) || [];

  // Get sentiment from data summary or AI result
  const sentimentPositive = dataSummary?.sentimentBreakdown?.positive ||
    (aiResult.sentimentAnalysis as any)?.positive || 33;
  const sentimentNegative = dataSummary?.sentimentBreakdown?.negative ||
    (aiResult.sentimentAnalysis as any)?.negative || 33;
  const sentimentNeutral = dataSummary?.sentimentBreakdown?.neutral ||
    (aiResult.sentimentAnalysis as any)?.neutral || 34;

  // Build sources array
  const sources: { platform: string; count: number }[] = [];
  if (enableXiaohongshu !== false) {
    const xhsCount = socialMediaData.sampleNotes?.filter((n: any) => n._platform !== 'douyin').length || sampleCount;
    if (xhsCount > 0) sources.push({ platform: "xiaohongshu", count: xhsCount });
  }
  if (enableDouyin) {
    const dyCount = socialMediaData.sampleNotes?.filter((n: any) => n._platform === 'douyin').length || 0;
    if (dyCount > 0) sources.push({ platform: "douyin", count: dyCount });
  }

  // Related keywords from tags
  const relatedKeywords = tags.filter(t => t !== keyword).slice(0, 10);

  const topicData = {
    keyword,
    category,
    heat_score: newHeatScore,
    growth_rate: null, // Would need historical data
    sample_count: Math.max(sampleCount, existingTopic?.sample_count || 0),
    avg_engagement: Math.round(totalEngagement / Math.max(1, sampleCount)),
    sentiment_positive: sentimentPositive,
    sentiment_negative: sentimentNegative,
    sentiment_neutral: sentimentNeutral,
    top_pain_points: topPainPoints,
    related_keywords: relatedKeywords,
    sources,
    created_by: existingTopic ? undefined : userId, // Don't overwrite original creator
    is_active: true,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days for validated topics
    // New fields for quality tracking
    validation_count: newValidationCount,
    avg_validation_score: newAvgValidationScore,
    confidence_level: confidenceLevel,
    quality_score: qualityScore,
    source_type: 'user_validation',
    last_crawled_at: new Date().toISOString(),
  };

  console.log(`[TrendingSync] Topic data: heat=${newHeatScore}, validation=${newAvgValidationScore}, quality=${qualityScore}, confidence=${confidenceLevel}`);

  // Upsert - update if keyword exists, insert if new
  const { error } = await supabase
    .from("trending_topics")
    .upsert(topicData, { onConflict: 'keyword' });

  if (error) {
    console.error("[TrendingSync] Failed to sync:", error);
    // Don't throw - this is non-critical
    return;
  }

  console.log(`[TrendingSync] Successfully synced topic: ${keyword} (quality: ${qualityScore})`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Validate inputs
    const idea = validateString(body.idea, "idea", LIMITS.IDEA_MAX_LENGTH, true)!;
    const tags = validateStringArray(body.tags, "tags", LIMITS.TAG_MAX_COUNT, LIMITS.TAG_MAX_LENGTH);
    const config = validateConfig(body.config);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new ValidationError("Authorization required");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new ValidationError("Invalid or expired session");

    // Check rate limit
    await checkRateLimit(supabase, user.id, "validate-idea");

    // ============ TikHub Quota Check ============
    const userProvidedTikhub = !!config?.tikhubToken;
    let tikhubToken = config?.tikhubToken;
    
    if (!userProvidedTikhub) {
      // Check quota before using system token
      const { data: quotaResult, error: quotaError } = await supabase.rpc('check_tikhub_quota', {
        p_user_id: user.id
      });
      
      if (quotaError) {
        console.error('Quota check error:', quotaError);
      }
      
      const quota = quotaResult?.[0];
      if (!quota?.can_use) {
        throw new ValidationError('FREE_QUOTA_EXCEEDED:免费验证次数已用完。请在设置中配置您的 TikHub API Token 后继续使用。');
      }
      
      // Use system TikHub token
      tikhubToken = Deno.env.get("TIKHUB_TOKEN");
    }

    // 1. Create validation record
    const { data: validation, error: createError } = await supabase
      .from("validations")
      .insert({
        user_id: user.id,
        idea,
        tags: tags || [],
        status: "processing",
      })
      .select()
      .single();

    if (createError || !validation) {
      console.error("Failed to create validation:", createError);
      throw new Error("Failed to create validation");
    }

    console.log("Created validation:", validation.id);

    // 1.5 Extract keywords with multi-dimensional expansion (uses system LLM)
    console.log("Extracting keywords...");
    const { xhsKeywords, webQueries, expanded } = await extractKeywords(idea, tags, config);
    console.log("Keywords extracted:", { xhsKeywords, webQueries });

    // 2. Crawl social media data (using multi-channel adapter architecture)
    const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);
    const mode = config?.mode || 'quick';
    const enableXiaohongshu = config?.enableXiaohongshu ?? true;
    const enableDouyin = config?.enableDouyin ?? false;

    const xiaohongshuData = await crawlSocialMediaData(
      xhsSearchTerm,
      tags || [],
      tikhubToken,
      mode,
      enableXiaohongshu,
      enableDouyin
    );
    console.log(`Crawled social media data for: ${xhsSearchTerm} (mode: ${mode}, XHS=${enableXiaohongshu}, DY=${enableDouyin})`);
    console.log(`[Multi-Channel] Stats: ${xiaohongshuData?.totalNotes || 0} posts, ${xiaohongshuData?.sampleComments?.length || 0} comments`);

    // 2.5 Search competitors with enhanced pipeline
    let competitorData: SearchResult[] = [];
    let extractedCompetitors: any[] = [];
    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const bochaKey = Deno.env.get("BOCHA_API_KEY");
    const youKey = Deno.env.get("YOU_API_KEY");
    const searchKeys = { tavily: tavilyKey, bocha: bochaKey, you: youKey };
    const hasAnySearchKey = tavilyKey || bochaKey || youKey;

    if (hasAnySearchKey) {
      console.log(`Searching competitors...`);

      // Initial search
      const searchPromises = webQueries.map(q => searchCompetitors(q, {
        providers: tavilyKey ? ['tavily'] : (bochaKey ? ['bocha'] : ['you']),
        keys: searchKeys,
        mode: config?.mode
      }));

      const results = await Promise.all(searchPromises);
      const rawCompetitors = results.flat();
      console.log(`Found ${rawCompetitors.length} competitor results`);

      // Jina Reader 清洗
      const cleanableUrls = rawCompetitors
        .filter((c: any) => c.url && isCleanableUrl(c.url))
        .slice(0, 6)
        .map((c: any) => c.url);

      let cleanedPages: any[] = [];
      if (cleanableUrls.length > 0) {
        try {
          console.log('[Jina] Cleaning', cleanableUrls.length, 'pages...');
          cleanedPages = await cleanCompetitorPages(cleanableUrls, 3, 4000);
          console.log('[Jina] Cleaned', cleanedPages.filter((p: any) => p.success).length, 'pages');
        } catch (e) {
          console.error('[Jina] Clean error:', e);
        }
      }

      // 合并清洗后的内容
      competitorData = rawCompetitors.map((comp: any) => {
        const cleaned = cleanedPages.find((p: any) => p.url === comp.url);
        return {
          ...comp,
          cleanedContent: cleaned?.success ? cleaned.markdown : comp.snippet,
          hasCleanedContent: cleaned?.success || false
        };
      });

      // 竞品名称提取
      const llmConfig: LLMConfig = {
        apiKey: Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || "",
        baseUrl: (Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "").replace(/\/chat\/completions$/, ""),
        model: Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview"
      };

      if (llmConfig.apiKey) {
        try {
          extractedCompetitors = await extractCompetitorNames(competitorData, idea, llmConfig);
          console.log('[Competitors] Extracted:', extractedCompetitors.map((c: any) => c.name));
        } catch (e) {
          console.error('[Competitors] Extract error:', e);
        }
      }

      // 二次深度搜索
      if (extractedCompetitors.length > 0) {
        try {
          const deepResults = await searchCompetitorDetails(extractedCompetitors, searchKeys);
          competitorData = mergeSearchResults(competitorData, deepResults);
          console.log('[DeepSearch] Added', deepResults.length, 'results');
        } catch (e) {
          console.error('[DeepSearch] Error:', e);
        }
      }
    } else {
      console.log("No search API keys configured, skipping competitor search.");
    }

    // 2.7 Enhanced Data Summarization with tiered approach
    console.log("Summarizing raw data with tiered approach...");
    
    const summaryConfig: SummaryConfig = {
      apiKey: Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || "",
      baseUrl: (Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "").replace(/\/chat\/completions$/, ""),
      model: Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview"
    };

    let socialSummaries: string[] = [];
    let competitorSummaries: string[] = [];
    let aggregatedInsights = { marketInsight: '', competitiveInsight: '', keyFindings: [] as string[] };

    if (summaryConfig.apiKey) {
      // Layer 1: 单条摘要
      const socialItems = (xiaohongshuData.sampleNotes || [])
        .slice(0, 8)
        .map((note: any) => ({
          content: `${note.title || ''}\n${note.desc || ''}`.trim(),
          type: 'social_post' as const
        }))
        .filter((item: any) => item.content.length > 20);

      const competitorItems = competitorData
        .slice(0, 5)
        .map((comp: any) => ({
          content: comp.cleanedContent || comp.snippet || '',
          type: 'competitor_page' as const
        }))
        .filter((item: any) => item.content.length > 50);

      if (socialItems.length > 0 || competitorItems.length > 0) {
        try {
          const allItems = [...socialItems, ...competitorItems];
          const summaries = await summarizeBatch(allItems, summaryConfig, 4);
          
          socialSummaries = summaries
            .filter((s: any) => s.type === 'social_post')
            .map((s: any) => s.content);
          competitorSummaries = summaries
            .filter((s: any) => s.type === 'competitor_page')
            .map((s: any) => s.content);

          console.log('[Summarizer] L1 done:', socialSummaries.length, 'social,', competitorSummaries.length, 'competitor');
        } catch (e) {
          console.error('[Summarizer] L1 error:', e);
        }
      }

      // Layer 2: 聚合摘要
      if (socialSummaries.length > 0 || competitorSummaries.length > 0) {
        try {
          aggregatedInsights = await aggregateSummaries(socialSummaries, competitorSummaries, summaryConfig);
          console.log('[Summarizer] L2 done');
        } catch (e) {
          console.error('[Summarizer] L2 error:', e);
        }
      }
    }

    // Also do the original data summary for backwards compatibility
    const dataSummary = await summarizeRawData(idea, xiaohongshuData, competitorData, {
      apiKey: Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY"),
      baseUrl: Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1",
      model: Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview",
      mode: config?.mode
    });
    console.log(`Data summary complete. Quality score: ${dataSummary.dataQuality.score}`);

    // 3. AI Analysis (now uses data summary for better context)
    const aiResult = await analyzeWithAI(idea, tags, xiaohongshuData, competitorData, dataSummary, config);
    console.log("AI analysis completed");

    // Debug: Log what we got from AI
    console.log("AI Result keys:", Object.keys(aiResult));
    console.log("AI Result dimensions:", JSON.stringify(aiResult.dimensions?.slice(0, 2)));
    console.log("AI Result persona:", aiResult.persona ? "exists" : "null");
    console.log("AI Result overallScore:", aiResult.overallScore);
    console.log("AI Result overallVerdict:", aiResult.overallVerdict?.slice(0, 50));

    // Default dimension reasons for meaningful fallbacks
    const defaultDimensionReasons: Record<string, string> = {
      "需求痛感": "基于用户反馈和市场调研的需求强度评估",
      "PMF潜力": "产品与市场匹配度的综合分析",
      "市场规模": "目标市场容量和增长趋势评估",
      "差异化": "与竞品的差异化程度分析",
      "可行性": "技术和商业实现的可行性评估",
      "盈利能力": "商业模式和盈利潜力分析",
      "护城河": "竞争优势和可持续性分析",
      "商业模式": "商业模式的可行性和盈利评估",
      "技术可行性": "技术实现难度和资源需求",
      "创新程度": "创新性和市场差异化程度"
    };

    // Ensure dimensions is an array with meaningful default values
    let dimensionsData = Array.isArray(aiResult.dimensions) && aiResult.dimensions.length > 0
      ? aiResult.dimensions.map((d: any) => ({
        dimension: d.dimension || "未知维度",
        score: typeof d.score === 'number' ? Math.min(100, Math.max(0, d.score)) : 50,
        reason: (d.reason && d.reason !== "待AI分析" && d.reason.length > 5)
          ? d.reason
          : (defaultDimensionReasons[d.dimension] || `基于市场数据对${d.dimension || "该维度"}的综合评估`)
      }))
      : [
        { dimension: "需求痛感", score: 50, reason: defaultDimensionReasons["需求痛感"] },
        { dimension: "PMF潜力", score: 50, reason: defaultDimensionReasons["PMF潜力"] },
        { dimension: "市场规模", score: 50, reason: defaultDimensionReasons["市场规模"] },
        { dimension: "差异化", score: 50, reason: defaultDimensionReasons["差异化"] },
        { dimension: "可行性", score: 50, reason: defaultDimensionReasons["可行性"] },
        { dimension: "盈利能力", score: 50, reason: defaultDimensionReasons["盈利能力"] },
      ];

    console.log("[Dimensions] Final data:", JSON.stringify(dimensionsData.slice(0, 2)));

    // Ensure persona has valid data with meaningful defaults
    let personaData = null;
    if (aiResult.persona && aiResult.persona.name && aiResult.persona.role) {
      personaData = {
        name: aiResult.persona.name,
        role: aiResult.persona.role,
        age: aiResult.persona.age || "25-45岁",
        income: aiResult.persona.income || "中等收入",
        painPoints: Array.isArray(aiResult.persona.painPoints) && aiResult.persona.painPoints.length > 0
          ? aiResult.persona.painPoints
          : ["需要更高效的解决方案", "现有选择无法满足需求"],
        goals: Array.isArray(aiResult.persona.goals) && aiResult.persona.goals.length > 0
          ? aiResult.persona.goals
          : ["找到更好的产品体验", "提升生活/工作效率"],
        techSavviness: typeof aiResult.persona.techSavviness === 'number' ? aiResult.persona.techSavviness : 65,
        spendingCapacity: typeof aiResult.persona.spendingCapacity === 'number' ? aiResult.persona.spendingCapacity : 60,
        description: aiResult.persona.description || `对"${idea.slice(0, 30)}..."有需求的核心用户群体`
      };
    } else if (aiResult.marketAnalysis?.targetAudience) {
      // Generate persona from market analysis if AI didn't provide one
      const targetAudience = String(aiResult.marketAnalysis.targetAudience || "");
      personaData = {
        name: "目标用户",
        role: targetAudience.split(/[、,，]/)[0]?.slice(0, 20) || "潜在用户",
        age: "25-45岁",
        income: "中等收入",
        painPoints: ["需要更高效的解决方案", "现有选择无法满足需求"],
        goals: ["找到更好的产品体验", "提升生活/工作效率"],
        techSavviness: 65,
        spendingCapacity: 60,
        description: `对"${idea.slice(0, 30)}..."感兴趣的${targetAudience.slice(0, 50)}`
      };
    }

    console.log("[Persona] Final data:", personaData ? "exists" : "null");

    // 4. Save report with robust retry logic for connection issues
    const reportData = {
      validation_id: validation.id,
      market_analysis: aiResult.marketAnalysis || {},
      xiaohongshu_data: xiaohongshuData,
      competitor_data: competitorData,
      sentiment_analysis: aiResult.sentimentAnalysis || {
        positive: 33,
        neutral: 34,
        negative: 33,
        topPositive: [],
        topNegative: []
      },
      ai_analysis: {
        ...(aiResult.aiAnalysis || {}),
        // 确保 feasibilityScore 与 overallScore 保持一致
        feasibilityScore: aiResult.overallScore || aiResult.aiAnalysis?.feasibilityScore || 0,
        overallVerdict: aiResult.overallVerdict || "AI分析完成",
        strengths: aiResult.strengths || aiResult.aiAnalysis?.strengths || [],
        weaknesses: aiResult.weaknesses || aiResult.aiAnalysis?.weaknesses || [],
        suggestions: aiResult.suggestions || aiResult.aiAnalysis?.suggestions || [],
        risks: aiResult.risks || aiResult.aiAnalysis?.risks || [],
      },
      dimensions: dimensionsData,
      persona: personaData,
      // Phase 1 new fields
      data_summary: dataSummary || {},
      data_quality_score: dataSummary?.dataQuality?.score || null,
      keywords_used: expanded ? {
        coreKeywords: expanded.coreKeywords,
        userPhrases: expanded.userPhrases,
        competitorQueries: expanded.competitorQueries,
        trendKeywords: expanded.trendKeywords
      } : [],
    };

    let reportSaved = false;
    let lastReportError: unknown = null;
    const maxRetries = 5;
    const retryDelays = [500, 1000, 2000, 3000, 5000]; // Exponential backoff

    for (let attempt = 0; attempt < maxRetries && !reportSaved; attempt++) {
      try {
        console.log(`Saving report (attempt ${attempt + 1}/${maxRetries})...`);

        const { error: reportError } = await supabase
          .from("validation_reports")
          .insert(reportData);

        if (!reportError) {
          reportSaved = true;
          console.log("Report saved successfully");
        } else {
          lastReportError = reportError;
          console.error(`Report save attempt ${attempt + 1} failed:`, reportError.message || reportError);

          if (attempt < maxRetries - 1) {
            const delay = retryDelays[attempt];
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (saveError) {
        lastReportError = saveError;
        console.error(`Report save attempt ${attempt + 1} threw error:`, saveError);

        if (attempt < maxRetries - 1) {
          const delay = retryDelays[attempt];
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!reportSaved) {
      console.error("Error saving report after all retries:", lastReportError);
      throw new Error("Failed to save report after multiple attempts");
    }

    // 4.5. Consume TikHub Quota (if using system token)
    if (!userProvidedTikhub) {
      const { error: consumeError } = await supabase.rpc('use_tikhub_quota', {
        p_user_id: user.id
      });
      if (consumeError) {
        console.error('Failed to consume quota:', consumeError);
      }
    }

    // 5. Update validation status
    const { error: updateError } = await supabase
      .from("validations")
      .update({
        status: "completed",
        overall_score: aiResult.overallScore,
      })
      .eq("id", validation.id);

    if (updateError) {
      console.error("Error updating validation:", updateError);
    }

    // 6. Sync to Trending Topics (if heat score is high enough)
    try {
      await syncToTrendingTopics(
        supabase,
        idea,
        tags,
        xiaohongshuData,
        dataSummary,
        aiResult,
        user.id,
        config?.enableXiaohongshu,
        config?.enableDouyin
      );
    } catch (syncError) {
      // Non-critical, log but don't fail the validation
      console.error("Error syncing to trending topics:", syncError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        validationId: validation.id,
        overallScore: aiResult.overallScore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
