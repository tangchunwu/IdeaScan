import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crawlRealXiaohongshuData, XhsNote, XhsComment } from "./tikhub.ts";
import { searchCompetitors, SearchResult } from "./search.ts";

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
  // Search Keys
  searchKeys?: {
    bocha?: string;
    you?: string;
    tavily?: string;
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

function parseJsonFromModelOutput<T = unknown>(text: string): T {
  const json = extractFirstJsonObject(text);
  if (!json) throw new Error("AI did not return valid JSON");

  // Remove common trailing commas (models sometimes output them)
  const normalized = json.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(normalized) as T;
}

type KeywordExtractionResult = { xhsKeywords: string[]; webQueries: string[] };

type AIResult = {
  overallScore: number;
  marketAnalysis: Record<string, unknown>;
  sentimentAnalysis: Record<string, unknown>;
  aiAnalysis: Record<string, unknown>;
  dimensions: Array<{ dimension: string; score: number }>;
};
async function crawlXiaohongshuData(idea: string, tags: string[], tikhubToken?: string) {
  const token = tikhubToken || Deno.env.get("TIKHUB_TOKEN");

  // Return empty data if no token - no mock data
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
  // 优先使用用户配置，否则使用环境变量
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

  const prompt = `Based on the following business idea description, please extract keywords for different search purposes.
  
  Business Idea: "${idea}"
  
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

  // Prepare sample data for AI context
  const sampleNotesText = (xiaohongshuData.sampleNotes || [])
    .slice(0, 5)
    .map((n: any, i: number) => `${i + 1}. 标题: ${n.title || "无"}\n   描述: ${(n.desc || "").slice(0, 100)}...\n   点赞: ${n.liked_count}, 收藏: ${n.collected_count}`)
    .join("\n");

  const sampleCommentsText = (xiaohongshuData.sampleComments || [])
    .slice(0, 10)
    .map((c: any) => `- "${(c.content || "").slice(0, 80)}..." (${c.user_nickname}, ${c.ip_location || "未知"})`)
    .join("\n");

  // Prepare Competitor Text
  const competitorText = competitorData.length > 0
    ? competitorData.map((c, i) => `${i + 1}. [${c.source}] ${c.title}\n   ${c.snippet}\n   链接: ${c.url}`).join("\n\n")
    : "未进行全网搜索或未找到相关竞品信息。";

  const prompt = `你是一位拥有20年经验的 CPO (Chief Product Officer) 和前风险投资人。请基于以下**真实市场数据**，为创业者撰写一份 **专业级商业验证备忘录 (Product Investment Memo)**。

商业创意：${idea}
相关标签：${tags.join(", ")}

---
**数据源1：小红书市场反馈 (用户声音)**
- 相关笔记数量：${xiaohongshuData.totalNotes}
- 平均互动数据 (点赞/评论/收藏)：${xiaohongshuData.avgLikes} / ${xiaohongshuData.avgComments} / ${xiaohongshuData.avgCollects}

${sampleNotesText ? `**热门笔记样本 (用户真正关心的点)：**
${sampleNotesText}` : ""}

${sampleCommentsText ? `**用户真实评论 (吐槽与期待)：**
${sampleCommentsText}` : ""}

---
**数据源2：全网竞品搜索 (竞争格局)**
${competitorText}

---

请以 **VC 投资备忘录** 的深度输出结论，但**只返回可被 JSON.parse 直接解析的严格 JSON**（不要 Markdown、不要任何解释文字、不要代码块标记）。

要求：
- 所有 0-100 的分数字段必须是 number（例如 42），不要写成“0-100”“约40%”“40/100”。
- 数组元素必须是字符串或对象，不要混入解释文字。
- 字段必须齐全，不能缺字段。

请严格按以下 **合法 JSON** 结构返回（字段名与层级不要改）：
{
  "overallScore": 0,
  "marketAnalysis": {
    "targetAudience": "",
    "marketSize": "",
    "competitionLevel": "",
    "trendDirection": "",
    "keywords": ["", "", "", ""]
  },
  "sentimentAnalysis": {
    "positive": 0,
    "neutral": 0,
    "negative": 0,
    "topPositive": ["", "", ""],
    "topNegative": ["", "", ""]
  },
  "aiAnalysis": {
    "feasibilityScore": 0,
    "strengths": ["", "", ""],
    "weaknesses": ["", "", ""],
    "suggestions": ["", "", "", ""],
    "risks": ["", ""]
  },
  "dimensions": [
    {"dimension": "市场需求 (Pain Point)", "score": 0},
    {"dimension": "竞争壁垒 (Moat)", "score": 0},
    {"dimension": "盈利能力 (Unit Economics)", "score": 0},
    {"dimension": "执行难度 (Feasibility)", "score": 0},
    {"dimension": "创新程度 (Novelty)", "score": 0},
    {"dimension": "PMF 潜力 (Product-Market Fit)", "score": 0}
  ]
}

**特别指令 (Critical Instructions)：**
1. **拒绝正确的废话**：不要说“要注重用户体验”，要说“用户抱怨现在的产品太贵/太慢，你的机会在于...”。
2. **引用数据**：必须引用上面的小红书样本或竞品信息作为论据。
3. **批判性思维**：如果想法很烂，请直言不讳指出风险与致命伤。`;

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
    throw new Error(`AI Analysis failed: ${text}`);
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
    const { idea, tags, config } = await req.json();

    if (!idea) throw new Error("Idea is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 获取当前用户
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization required");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Invalid user token");

    // 1. 创建验证记录
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
      throw new Error("Failed to create validation record");
    }

    console.log("Created validation:", validation.id);

    // 1.5 智能关键词提炼
    console.log("Extracting keywords...");
    const { xhsKeywords, webQueries } = await extractKeywords(idea, config);
    console.log("Keywords extracted:", { xhsKeywords, webQueries });

    // 2. 爬取小红书数据 (使用提炼出的第一个关键词)
    const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);
    const xiaohongshuData = await crawlXiaohongshuData(xhsSearchTerm, tags || [], config?.tikhubToken);
    console.log(`Crawled Xiaohongshu data for: ${xhsSearchTerm}`);

    // 2.5 全网搜集竞品
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
        keys: searchKeys
      }));

      const results = await Promise.all(searchPromises);
      competitorData = results.flat();
      console.log(`Found ${competitorData.length} competitor results`);
    } else {
      console.log("No search keys provided, skipping competitor search.");
    }

    // 3. AI 分析
    const aiResult = await analyzeWithAI(idea, tags, xiaohongshuData, competitorData, config);
    console.log("AI analysis completed");

    // 4. 保存报告
    const { error: reportError } = await supabase
      .from("validation_reports")
      .insert({
        validation_id: validation.id,
        market_analysis: aiResult.marketAnalysis,
        xiaohongshu_data: xiaohongshuData,
        sentiment_analysis: aiResult.sentimentAnalysis,
        ai_analysis: aiResult.aiAnalysis,
        dimensions: aiResult.dimensions,
      });

    if (reportError) {
      console.error("Error saving report:", reportError);
      throw new Error("Failed to save validation report");
    }

    // 5. 更新验证状态
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
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in validate-idea function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
