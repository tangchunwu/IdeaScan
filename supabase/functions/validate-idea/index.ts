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

function repairJson(json: string): string {
  let repaired = json;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  // Fix missing commas between array items or object properties
  // Pattern: "]" followed by whitespace then "[" or "{" or quote
  repaired = repaired.replace(/\](\s+)\[/g, "],$1[");
  repaired = repaired.replace(/\](\s+)\{/g, "],$1{");
  repaired = repaired.replace(/\](\s+)"/g, "],$1\"");
  
  // Pattern: "}" followed by whitespace then "{" or quote (for object properties)
  repaired = repaired.replace(/\}(\s+)\{/g, "},$1{");
  repaired = repaired.replace(/\}(\s+)"/g, "},$1\"");

  // Fix missing comma after string values: "value" followed by newline then "key"
  repaired = repaired.replace(/"(\s*\n\s*)"/g, "\",$1\"");

  // Fix arrays ending with values missing comma before next property
  // e.g. ["item"]\n    "nextKey" -> ["item"],\n    "nextKey"
  repaired = repaired.replace(/\](\s*\n\s*)"([a-zA-Z_])/g, "],$1\"$2");

  return repaired;
}

// Try to complete truncated JSON by adding missing closing brackets
function completeTruncatedJson(json: string): string {
  // Count open and close brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  // If we're in the middle of a string, close it
  let completed = json;
  if (inString) {
    completed += '"';
  }
  
  // Remove any trailing incomplete key-value pairs
  // e.g., `"someKey": "incomplete` or `"someKey": [`
  completed = completed.replace(/,\s*"[^"]*":\s*("[^"]*)?$/g, '');
  completed = completed.replace(/,\s*"[^"]*":\s*\[?\s*$/g, '');
  
  // Add missing closing brackets
  for (let i = 0; i < openBrackets; i++) {
    completed += ']';
  }
  for (let i = 0; i < openBraces; i++) {
    completed += '}';
  }

  return completed;
}

function parseJsonFromModelOutput<T = unknown>(text: string): T {
  const json = extractFirstJsonObject(text);
  if (!json) {
    console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
    throw new Error("AI did not return valid JSON");
  }

  // Try parsing as-is first
  try {
    return JSON.parse(json) as T;
  } catch (_firstError) {
    // Try repairing common issues
    const repaired = repairJson(json);
    try {
      return JSON.parse(repaired) as T;
    } catch (_secondError) {
      // Try completing truncated JSON
      const completed = completeTruncatedJson(repaired);
      try {
        console.log("Attempting to parse completed JSON...");
        return JSON.parse(completed) as T;
      } catch (_thirdError) {
        // Log all attempts for debugging
        console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
        console.error("JSON repair failed. Original (500 chars):", json.slice(0, 500));
        console.error("Repaired attempt (500 chars):", repaired.slice(0, 500));
        console.error("Completed attempt (last 200 chars):", completed.slice(-200));
        throw new Error("AI returned malformed JSON that could not be repaired");
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

  // Prepare Competitor Text (Formatted as Table for better AI context)
  const competitorText = competitorData.length > 0
    ? competitorData.map((c, i) => `| ${i + 1} | ${c.title.slice(0, 30)}... | ${c.snippet.slice(0, 150)}... | ${c.source} |`).join("\n")
    : "未进行全网搜索或未找到相关竞品信息。";

  const prompt = `Act as a **General Partner at a Top-Tier VC Firm** (e.g., Sequoia, Benchmark). Your job is to write a brutal, honest, and data-driven **Investment Memo** for an internal Investment Committee (IC) meeting.

  **Target Startup**:
  - Idea: "${idea}"
  - Tags: ${tags.join(", ")}

  ---
  **EVIDENCE PACK (Use this data to justify EVERY score):**

  **Source A: User Voice (Xiaohongshu/Social Media)**
  - Market Volume: ${xiaohongshuData.totalNotes} notes found.
  - Engagement: Avg ${xiaohongshuData.avgLikes} likes, ${xiaohongshuData.avgComments} comments.
  
  ${sampleNotesText ? `**Key User Snippets (What users ACTUALLY care about):**
  ${sampleNotesText}` : ""}
  
  ${sampleCommentsText ? `**Real User Complaints/Feedback:**
  ${sampleCommentsText}` : ""}

  **Source B: Competitive Landscape**
  | # | Competitor | Snippet (Value Prop) | Source |
  |---|---|---|---|
  ${competitorText}

  ---

  **TASK:**
  Analyze the above evidence and output a **strict JSON** report.

  **SCORING RUBRIC (0-100):**
  - **90-100 (Unicorn)**: Monopoly potential, huge starving market, 10x better product.
  - **70-89 (Investable)**: Strong traction, clear moat, good team/market fit.
  - **40-69 (Watchlist)**: Crowded market, weak differentiation, or niche appeal.
  - **0-39 (Pass)**: "Tar Pit" idea, solution looking for a problem, or fatal flaw.

  **CRITICAL INSTRUCTIONS:**
  1. **BRUTAL HONESTY**: Do not be polite. If it's a bad idea, say it. If the market is crowded (see Source B), call it out.
  2. **CITE EVIDENCE**: When analyzing "Market Demand", quote specific XHS comments (Source A). When analyzing "Competition", name specific competitors found (Source B).
  3. **NO GENERIC ADVICE**: Don't say "improve UX". Say "Users in comment #3 complained about price, so lower CAC is key."

  **Output ONLY valid JSON** with this structure (no markdown, no thinking text outside JSON):
  {
    "overallScore": 0,
    "overallVerdict": "One-sentence brutal summary (e.g., 'A crowded space with no clear moat')",
    "marketAnalysis": {
      "targetAudience": "Specific persona (e.g. 'GenZ students in Tier 1 cities')",
      "marketSize": "Tam/Sam/Som estimate or market vibe (e.g. 'Red Ocean')",
      "competitionLevel": "Detailed competition analysis citing Source B competitors",
      "trendDirection": "Rising/Falling/Stable",
      "keywords": ["High intent keyword 1", "Keyword 2"]
    },
    "sentimentAnalysis": {
      "positive": 0,
      "neutral": 0,
      "negative": 0,
      "topPositive": ["Specific praise from Source A"],
      "topNegative": ["Specific complaint from Source A"]
    },
    "aiAnalysis": {
      "feasibilityScore": 0,
      "strengths": ["Unfair Advantage 1", "Moat 2"],
      "weaknesses": ["Deadly Flaw 1", "Risk 2"],
      "suggestions": [
        {
          "action": "Specific action to take",
          "reference": "Reference case (e.g., 'Notion used PLG to grow without sales team')",
          "expectedResult": "Expected outcome if this action is taken"
        }
      ],
      "risks": ["Pre-mortem risk 1", "Regulatory risk 2"]
    },
    "dimensions": [
      {"dimension": "Market Pain (Urgency)", "score": 0, "reason": "Why this score - cite specific evidence from Source A/B"},
      {"dimension": "Moat (Defensibility)", "score": 0, "reason": "Why this score - what competitors do better?"},
      {"dimension": "Business Model (Unit Economics)", "score": 0, "reason": "Why this score - is monetization viable?"},
      {"dimension": "Tech Feasibility", "score": 0, "reason": "Why this score - any technical blockers?"},
      {"dimension": "Novelty (0-1)", "score": 0, "reason": "Why this score - what's truly new here?"},
      {"dimension": "PMF Potential", "score": 0, "reason": "Why this score - does market want this?"}
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
        competitor_data: competitorData, // Save gathered competitor data
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
