import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crawlRealXiaohongshuData, XhsNote, XhsComment } from "./tikhub.ts";
import { searchCompetitors, SearchResult } from "./search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 声明 Config 接口
interface RequestConfig {
  llmProvider?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  tikhubToken?: string;
  searchProvider?: 'bocha' | 'you' | 'none';
  searchApiKey?: string;
}

// ... (keep ValidationRequest)

// ... (keep crawlXiaohongshuData and mock)

// 使用 AI 进行商业分析
async function analyzeWithAI(
  idea: string,
  tags: string[],
  xiaohongshuData: any,
  competitorData: SearchResult[],
  config?: RequestConfig
) {
  // ... (keep Config Logic)

  // ... (keep endpoint logic)

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

  const prompt = `你是一位资深的商业分析师和市场研究专家。请基于以下**真实小红书数据**和**全网竞品搜索数据**，对这个商业创意进行全面的可行性分析：

商业创意：${idea}
相关标签：${tags.join(", ")}

---
**数据源1：小红书市场反馈**
- 相关笔记数量：${xiaohongshuData.totalNotes}
- 平均点赞数：${xiaohongshuData.avgLikes}
- 平均评论数：${xiaohongshuData.avgComments}
- 平均收藏数：${xiaohongshuData.avgCollects}

${sampleNotesText ? `**热门笔记样本：**
${sampleNotesText}` : ""}

${sampleCommentsText ? `**用户评论样本：**
${sampleCommentsText}` : ""}

---
**数据源2：全网竞品搜索 (Web Search)**
${competitorText}

---

请基于以上所有真实数据，以JSON格式返回分析结果，包含以下字段：
{
  "overallScore": 0-100的综合评分,
  "marketAnalysis": {
    "targetAudience": "目标用户群体描述",
    "marketSize": "小型/中型/大型",
    "competitionLevel": "低/中/高",
    "trendDirection": "上升/稳定/下降",
    "keywords": ["热门关键词1", "热门关键词2", "热门关键词3", "热门关键词4"]
  },
  "sentimentAnalysis": {
    "positive": 正面评价百分比(0-100),
    "neutral": 中性评价百分比(0-100),
    "negative": 负面评价百分比(0-100),
    "topPositive": ["正面关键词1", "正面关键词2", "正面关键词3", "正面关键词4"],
    "topNegative": ["负面关键词1", "负面关键词2", "负面关键词3"]
  },
  "aiAnalysis": {
    "feasibilityScore": 可行性评分(0-100),
    "strengths": ["优势1", "优势2", "优势3", "优势4"],
    "weaknesses": ["劣势1", "劣势2", "劣势3", "劣势4"],
    "suggestions": ["建议1", "建议2", "建议3", "建议4", "建议5"],
    "risks": ["风险1", "风险2", "风险3"]
  },
  "dimensions": [
    {"dimension": "市场需求", "score": 0-100},
    {"dimension": "竞争环境", "score": 0-100},
    {"dimension": "盈利潜力", "score": 0-100},
    {"dimension": "可行性", "score": 0-100},
    {"dimension": "风险程度", "score": 0-100},
    {"dimension": "创新性", "score": 0-100}
  ]
}

**特别要求：**
1. 在“竞争环境”和“风险”分析中，请务必参考提供的【全网竞品搜索】数据，指出具体的竞争对手或类似产品。
2. 请确保返回的是有效的JSON格式，不要包含任何其他文字。`;

  // ... (fetch logic)
}

// ... inside serve ...

// 智能关键词提炼
async function extractKeywords(idea: string, config?: RequestConfig): Promise<{ xhsKeywords: string[], webQueries: string[] }> {
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };
  } catch (e) {
    console.error("Keyword extraction failed:", e);
    return { xhsKeywords: [idea.slice(0, 10)], webQueries: [idea.slice(0, 20)] };
  }
}

// ... inside serve ...

// 1.5 智能关键词提炼
console.log("Extracting keywords...");
const { xhsKeywords, webQueries } = await extractKeywords(idea, config);
console.log("Keywords extracted:", { xhsKeywords, webQueries });

// 2. 爬取小红书数据 (使用提炼出的第一个关键词)
// 如果没有提炼出有效关键词，回退到原始 idea 的前 20 个字
const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);
const xiaohongshuData = await crawlXiaohongshuData(xhsSearchTerm, tags, config?.tikhubToken);
console.log(`Crawled Xiaohongshu data for: ${xhsSearchTerm}`);

// 2.5 全网搜集竞品
let competitorData: SearchResult[] = [];
if (config?.searchProvider && config.searchProvider !== 'none' && config.searchApiKey) {
  console.log(`Searching competitors using ${config.searchProvider}...`);
  // 并行执行所有 webQueries 的搜索
  const searchPromises = webQueries.map(q => searchCompetitors(q, config.searchProvider!, config.searchApiKey!));
  const results = await Promise.all(searchPromises);
  // 打平结果数组
  competitorData = results.flat();
  console.log(`Found ${competitorData.length} competitor results`);
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

console.log(`Validation ${validation.id} completed successfully`);

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
