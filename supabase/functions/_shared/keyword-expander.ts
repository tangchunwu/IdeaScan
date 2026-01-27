/**
 * Shared Keyword Expansion Module
 */

import { sanitizeForPrompt } from "./validation.ts";

export interface ExpandedKeywords {
  coreKeywords: string[];
  userPhrases: string[];
  competitorQueries: string[];
  trendKeywords: string[];
}

export interface KeywordExpansionResult {
  xhsKeywords: string[];
  webQueries: string[];
  expanded: ExpandedKeywords;
}

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
2. **用户搜索词 (userPhrases)**: 2-3个用户在遇到这个问题时会搜索的词语或句子
3. **竞品搜索词 (competitorQueries)**: 2-3个用于在搜索引擎查找竞品的查询语句
4. **趋势关键词 (trendKeywords)**: 2个用于了解市场趋势的关键词

仅返回 JSON 格式（无解释文字）:
{
  "coreKeywords": ["短关键词1", "短关键词2"],
  "userPhrases": ["用户搜索句1", "用户搜索句2"],
  "competitorQueries": ["竞品查询1", "竞品查询2"],
  "trendKeywords": ["趋势词1", "趋势词2"]
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

    if (!response.ok) {
      console.error("Keyword expansion API error:", response.status);
      const fallback = createFallbackKeywords(idea, tags);
      return {
        xhsKeywords: fallback.coreKeywords.slice(0, 2),
        webQueries: fallback.competitorQueries.slice(0, 2),
        expanded: fallback
      };
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
      const fallback = createFallbackKeywords(idea, tags);
      return {
        xhsKeywords: fallback.coreKeywords.slice(0, 2),
        webQueries: fallback.competitorQueries.slice(0, 2),
        expanded: fallback
      };
    }
  } catch (e) {
    const fallback = createFallbackKeywords(idea, tags);
    return {
      xhsKeywords: fallback.coreKeywords.slice(0, 2),
      webQueries: fallback.competitorQueries.slice(0, 2),
      expanded: fallback
    };
  }
}

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

function parseKeywordJson(text: string): ExpandedKeywords {
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
