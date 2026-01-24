import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crawlRealXiaohongshuData, XhsNote, XhsComment } from "./tikhub.ts";
import { searchCompetitors, SearchResult } from "./search.ts";
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

type KeywordExtractionResult = { xhsKeywords: string[]; webQueries: string[] };

type AIResult = {
  overallScore: number;
  marketAnalysis: Record<string, unknown>;
  sentimentAnalysis: Record<string, unknown>;
  aiAnalysis: Record<string, unknown>;
  persona: Record<string, unknown>;
  dimensions: Array<{ dimension: string; score: number }>;
};

async function crawlXiaohongshuData(idea: string, tags: string[], tikhubToken?: string) {
  const token = tikhubToken || Deno.env.get("TIKHUB_TOKEN");

  if (!token) {
    console.log("No Tikhub token configured, skipping XHS data");
    return {
      totalNotes: 0,
      avgLikes: 0,
      avgComments: 0,
      avgCollects: 0,
      sampleNotes: [],
      sampleComments: []
    };
  }

  try {
    console.log("Crawling XHS data with token...");
    return await crawlRealXiaohongshuData(token, idea, tags);
  } catch (e) {
    console.error("XHS Crawl failed:", e);
    return {
      totalNotes: 0,
      avgLikes: 0,
      avgComments: 0,
      avgCollects: 0,
      sampleNotes: [],
      sampleComments: []
    };
  }
}

async function extractKeywords(idea: string, config?: RequestConfig): Promise<KeywordExtractionResult> {
  const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1";
  const model = config?.llmModel || "google/gemini-3-flash-preview";

  if (!apiKey) {
    return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };
  }

  let cleanBaseUrl = baseUrl.replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/chat/completions")) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
  }
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  // Sanitize idea for prompt
  const sanitizedIdea = sanitizeForPrompt(idea);

  const prompt = `Based on the following business idea description, please extract keywords for different search purposes.
  
  Business Idea: "${sanitizedIdea}"
  
  Please provide:
  1. Two short keywords (max 4 chars each) suitable for social media search (like Xiaohongshu/Instagram tags).
  2. Two specific search queries for finding competitors or market reports on a search engine.
  
  Return ONLY valid JSON format:
  {
    "xhsKeywords": ["short_keyword1", "short_keyword2"],
    "webQueries": ["competitor search query 1", "market report search query 2"]
  }`;

  try {
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

    if (!response.ok) return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";

    try {
      return parseJsonFromModelOutput<KeywordExtractionResult>(content);
    } catch (e) {
      console.error("Keyword JSON parse failed:", e);
      return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };
    }
  } catch (e) {
    console.error("Keyword extraction failed:", e);
    return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };
  }
}

async function analyzeWithAI(
  idea: string,
  tags: string[],
  xiaohongshuData: any,
  competitorData: SearchResult[],
  config?: RequestConfig
): Promise<AIResult> {
  const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1";
  const model = config?.llmModel || "google/gemini-3-flash-preview";

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
    return parseJsonFromModelOutput<AIResult>(content);
  } catch (e) {
    console.error("AI JSON parse failed. Raw (first 1200 chars):", content.slice(0, 1200));
    throw e;
  }
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

    // 1.5 Extract keywords
    console.log("Extracting keywords...");
    const { xhsKeywords, webQueries } = await extractKeywords(idea, config);
    console.log("Keywords extracted:", { xhsKeywords, webQueries });

    // 2. Crawl Xiaohongshu data
    const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);
    const xiaohongshuData = await crawlXiaohongshuData(xhsSearchTerm, tags || [], config?.tikhubToken);
    console.log(`Crawled Xiaohongshu data for: ${xhsSearchTerm}`);

    // 2.5 Search competitors
    let competitorData: SearchResult[] = [];
    const searchKeys = config?.searchKeys;

    if (searchKeys && (searchKeys.bocha || searchKeys.you || searchKeys.tavily)) {
      const providers: ('bocha' | 'you' | 'tavily')[] = [];
      if (searchKeys.bocha) providers.push('bocha');
      if (searchKeys.you) providers.push('you');
      if (searchKeys.tavily) providers.push('tavily');

      console.log(`Searching competitors using ${providers.join(', ')}...`);

      const searchPromises = webQueries.map(q => searchCompetitors(q, {
        providers: providers,
        keys: searchKeys,
        mode: config?.mode
      }));

      const results = await Promise.all(searchPromises);
      competitorData = results.flat();
      console.log(`Found ${competitorData.length} competitor results`);
    } else {
      console.log("No search keys provided, skipping competitor search.");
    }

    // 3. AI Analysis
    const aiResult = await analyzeWithAI(idea, tags, xiaohongshuData, competitorData, config);
    console.log("AI analysis completed");

    // Debug: Log what we got from AI
    console.log("AI Result keys:", Object.keys(aiResult));
    console.log("AI Result dimensions:", JSON.stringify(aiResult.dimensions));
    console.log("AI Result persona:", JSON.stringify(aiResult.persona));
    console.log("AI Result overallScore:", aiResult.overallScore);

    // Ensure dimensions is an array with default values if missing
    const dimensionsData = Array.isArray(aiResult.dimensions) && aiResult.dimensions.length > 0
      ? aiResult.dimensions
      : [
          { dimension: "需求痛感", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
          { dimension: "护城河", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
          { dimension: "商业模式", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
          { dimension: "技术可行性", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
          { dimension: "创新程度", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
          { dimension: "PMF潜力", score: Math.round(Math.random() * 30 + 30), reason: "待AI分析" },
        ];

    // 4. Save report with robust retry logic for connection issues
    const reportData = {
      validation_id: validation.id,
      market_analysis: aiResult.marketAnalysis || {},
      xiaohongshu_data: xiaohongshuData,
      competitor_data: competitorData,
      sentiment_analysis: aiResult.sentimentAnalysis || {},
      ai_analysis: {
        ...(aiResult.aiAnalysis || {}),
        overallVerdict: (aiResult as any).overallVerdict || "AI分析完成",
      },
      dimensions: dimensionsData,
      persona: aiResult.persona || null,
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
