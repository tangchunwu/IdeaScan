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

请以 **VC 投资备忘录** 的深度，严格遵守以下 JSON 结构返回分析结果（不要包含 Markdown 格式）：

{
  "overallScore": 0-100之间的投资推荐指数,
  "marketAnalysis": {
    "targetAudience": "详细的用户画像（不仅是人口统计学，更要包含痛点、动机和生活方式）",
    "marketSize": "市场规模预估 (TAM/SAM/SOM 概念描述)",
    "competitionLevel": "蓝海/红海/寡头垄断",
    "trendDirection": "爆发期/平稳期/衰退期",
    "keywords": ["核心关键词1", "核心关键词2", "核心关键词3", "核心关键词4"]
  },
  "sentimentAnalysis": {
    "positive": 正面情绪占比(0-100),
    "neutral": 中性情绪占比(0-100),
    "negative": 负面情绪占比(0-100),
    "topPositive": ["用户最喜欢的点1", "用户最喜欢的点2", "用户最喜欢的点3"],
    "topNegative": ["用户最无法忍受的点1 (致命伤)", "用户最无法忍受的点2", "用户最无法忍受的点3"]
  },
  "aiAnalysis": {
    "feasibilityScore": MVP可行性评分(0-100),
    "strengths": ["核心优势 (The Unfair Advantage) 1", "核心优势 2", "核心优势 3"],
    "weaknesses": ["致命弱点 1", "致命弱点 2", "致命弱点 3"],
    "suggestions": [
      "MVP 定义: 第一版产品只做哪3个功能？",
      "GTM 策略: 前1000个种子用户去哪里找？",
      "商业模式: 如何建立正向的单体经济模型？",
      "差异化: 一句话说清为什么用户选你不选对手？"
    ],
    "risks": ["Pre-Mortem (事前验尸): 如果项目失败，最通常的原因是什么？", "如何规避该风险？"]
  },
  "dimensions": [
    {"dimension": "市场需求 (Pain Point)", "score": 0-100},
    {"dimension": "竞争壁垒 (Moat)", "score": 0-100},
    {"dimension": "盈利能力 (Unit Economics)", "score": 0-100},
    {"dimension": "执行难度 (Feasibility)", "score": 0-100},
    {"dimension": "创新程度 (Novelty)", "score": 0-100},
    {"dimension": "PMF 潜力 (Product-Market Fit)", "score": 0-100}
  ]
}

**特别指令 (Critical Instructions)：**
1.  **拒绝正确的废话**：不要说“要注重用户体验”，要说“用户抱怨现在的产品太贵/太慢，你的机会在于...”。
2.  **引用数据**：在分析中必须明确引用提供的小红书笔记或竞品信息作为论据。
3.  **批判性思维**：如果这个想法很烂，请直言不讳地指出（Risk 部分），不要盲目鼓励。
4.  请确保返回的是标准的 JSON 格式。`;

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
