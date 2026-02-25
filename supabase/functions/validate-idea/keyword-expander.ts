/**
 * Smart Keyword Expansion Module
 * Expands keywords from 4 dimensions: core, user, competitor, trend
 */

import { sanitizeForPrompt } from "../_shared/validation.ts";

export interface ExpandedKeywords {
  // Core keywords: directly describe the need
  coreKeywords: string[];
  // User phrases: what users search/complain about
  userPhrases: string[];
  // Competitor queries: for finding competitors
  competitorQueries: string[];
  // Trend keywords: for market trend analysis
  trendKeywords: string[];
}

export interface KeywordExpansionResult {
  xhsKeywords: string[];
  webQueries: string[];
  expanded: ExpandedKeywords;
}

/**
 * Extract and expand keywords from multiple dimensions
 */
export async function expandKeywords(
  idea: string,
  tags: string[],
  config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }
): Promise<KeywordExpansionResult> {
  const apiKey = config.apiKey || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = config.baseUrl || "https://ai.gateway.lovable.dev/v1";
  const model = config.model || "google/gemini-3-flash-preview";

  if (!apiKey) {
    // Fallback: basic keyword extraction
    const fallback = createFallbackKeywords(idea, tags);
    return {
      xhsKeywords: fallback.coreKeywords.slice(0, 2),
      webQueries: fallback.competitorQueries.slice(0, 2),
      expanded: fallback
    };
  }

  let cleanBaseUrl = baseUrl.replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/chat/completions")) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
  }
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  const sanitizedIdea = sanitizeForPrompt(idea);
  const sanitizedTags = tags.map(t => sanitizeForPrompt(t)).join(", ");

  const prompt = `你是一名专业的市场调研分析师。基于以下创业想法，从四个维度提取搜索关键词。

**创业想法**: "${sanitizedIdea}"
${sanitizedTags ? `**标签**: ${sanitizedTags}` : ""}

请从以下四个维度提取关键词：

1. **核心关键词 (coreKeywords)**: 2-3个直接描述该需求的短关键词（每个2-4个字），用于社交媒体搜索
   - 例如：宠物喂食 → ["智能喂食", "自动猫粮"]

2. **用户搜索词 (userPhrases)**: 2-3个用户在遇到这个问题时会搜索的词语或句子（自然语言）
   - 例如：["出差猫怎么办", "定时喂猫", "上班族养猫"]

3. **竞品搜索词 (competitorQueries)**: 2-3个用于在搜索引擎查找竞品的查询语句
   - 例如：["宠物自动喂食器品牌", "智能宠物用品公司", "小佩 vs 米家"]

4. **趋势关键词 (trendKeywords)**: 2个用于了解市场趋势的关键词
   - 例如：["宠物经济趋势", "智能家居市场"]

仅返回 JSON 格式（无解释文字）:
{
  "coreKeywords": ["短关键词1", "短关键词2"],
  "userPhrases": ["用户搜索句1", "用户搜索句2"],
  "competitorQueries": ["竞品查询1", "竞品查询2"],
  "trendKeywords": ["趋势词1", "趋势词2"]
}`;

  // Build candidate configs: user-provided first, then Lovable AI fallback
  const candidates: Array<{ ep: string; key: string; mdl: string }> = [];
  candidates.push({ ep: endpoint, key: apiKey, mdl: model });
  
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey && apiKey !== lovableKey) {
    candidates.push({
      ep: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovableKey,
      mdl: "google/gemini-3-flash-preview",
    });
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.ep, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${candidate.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidate.mdl,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        console.error(`Keyword expansion API error (${candidate.ep}):`, response.status);
        continue;
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";

      try {
        const parsed = parseKeywordJson(content);
        
        const xhsKeywords = [
          ...(parsed.coreKeywords || []).slice(0, 2),
          ...(parsed.userPhrases || []).slice(0, 1)
        ].slice(0, 3);
        
        const webQueries = [
          ...(parsed.competitorQueries || []).slice(0, 2),
          ...(parsed.trendKeywords || []).slice(0, 1)
        ].slice(0, 3);

        return {
          xhsKeywords,
          webQueries,
          expanded: {
            coreKeywords: parsed.coreKeywords || [],
            userPhrases: parsed.userPhrases || [],
            competitorQueries: parsed.competitorQueries || [],
            trendKeywords: parsed.trendKeywords || []
          }
        };
      } catch (e) {
        console.error("Keyword JSON parse failed, trying next:", e);
        continue;
      }
    } catch (e) {
      console.error("Keyword expansion candidate failed:", e);
      continue;
    }
  }

  // All candidates failed
  const fallback = createFallbackKeywords(idea, tags);
  return {
    xhsKeywords: fallback.coreKeywords.slice(0, 2),
    webQueries: fallback.competitorQueries.slice(0, 2),
    expanded: fallback
  };
}

/**
 * Create fallback keywords when AI is unavailable
 */
function createFallbackKeywords(idea: string, tags: string[]): ExpandedKeywords {
  const ideaShort = idea.slice(0, 20);
  const ideaMedium = idea.slice(0, 40);
  
  return {
    coreKeywords: [
      idea.slice(0, 8),
      tags[0]?.slice(0, 8) || idea.slice(8, 16)
    ].filter(Boolean),
    userPhrases: [
      ideaShort,
      `${ideaShort}怎么办`
    ],
    competitorQueries: [
      `${ideaMedium} 品牌`,
      `${ideaMedium} 竞品`
    ],
    trendKeywords: [
      `${tags[0] || ideaShort} 趋势`,
      `${tags[0] || ideaShort} 市场`
    ]
  };
}

/**
 * Parse JSON from AI response with error handling
 */
function parseKeywordJson(text: string): ExpandedKeywords {
  // Try to extract JSON from the response
  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON found in response");
  }

  const jsonStr = cleaned.slice(first, last + 1);
  return JSON.parse(jsonStr) as ExpandedKeywords;
}
