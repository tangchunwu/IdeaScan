/**
 * Data Summarizer Module
 * Pre-processes raw data into structured summary before AI deep analysis
 * 
 * Features:
 * - Pain point clustering
 * - Competitor matrix analysis
 * - Sentiment breakdown
 * - Cross-platform resonance analysis (NEW)
 * - Market signal detection
 */

import { XhsNote, XhsComment } from "./tikhub.ts";
import { SearchResult } from "./search.ts";
import { sanitizeForPrompt } from "../_shared/validation.ts";

export interface PainPointCluster {
  theme: string;
  frequency: number;
  sampleQuotes: string[];
  type: 'complaint' | 'question' | 'recommendation' | 'comparison';
}

export interface CompetitorCategory {
  category: string;
  count: number;
  topPlayers: string[];
  commonPricing?: string;
}

export interface MarketSignal {
  signal: string;
  evidence: string;
  implication: string;
  confidence: number;
}

export interface DataQuality {
  score: number;
  sampleSize: number;
  diversityScore: number;
  recencyScore: number;
  recommendation: string;
}

/**
 * Cross-platform resonance analysis - identifies pain points
 * that appear across multiple platforms (high-intensity needs)
 */
export interface CrossPlatformResonance {
  keyword: string;
  platforms: string[];
  totalMentions: number;
  xhsMentions: number;
  douyinMentions: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  isHighIntensity: boolean;
  sampleQuotes: { platform: string; quote: string }[];
}

export interface DataSummary {
  painPointClusters: PainPointCluster[];
  competitorMatrix: CompetitorCategory[];
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    topPositiveThemes: string[];
    topNegativeThemes: string[];
  };
  marketSignals: MarketSignal[];
  dataQuality: DataQuality;
  keyInsights: string[];
  /** Cross-platform resonance analysis - pain points validated across multiple platforms */
  crossPlatformResonance?: CrossPlatformResonance[];
}

interface CommentWithPlatform {
  content?: string;
  text?: string;
  _platform?: string;
  user_nickname?: string;
  ip_location?: string;
}

interface XhsData {
  totalNotes: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  sampleNotes: XhsNote[];
  sampleComments: (XhsComment & { _platform?: string })[];
}

/**
 * Summarize raw data into structured format for AI analysis
 */
export async function summarizeRawData(
  idea: string,
  xhsData: XhsData,
  competitorData: SearchResult[],
  config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    mode?: 'quick' | 'deep';
  }
): Promise<DataSummary> {
  const apiKey = config.apiKey || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = config.baseUrl || "https://ai.gateway.lovable.dev/v1";
  const model = config.model || "google/gemini-3-flash-preview";

  // Calculate data quality first
  const dataQuality = calculateDataQuality(xhsData, competitorData);

  // If data is too sparse, return basic summary
  if (dataQuality.score < 20) {
    return createSparseSummary(idea, xhsData, competitorData, dataQuality);
  }

  if (!apiKey) {
    return createBasicSummary(idea, xhsData, competitorData, dataQuality);
  }

  let cleanBaseUrl = baseUrl.replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/chat/completions")) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
  }
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  // Prepare data for summarization
  const notesText = xhsData.sampleNotes
    .slice(0, 10)
    .map((n, i) => `${i + 1}. "${sanitizeForPrompt(n.title)}" - ${sanitizeForPrompt(n.desc?.slice(0, 100) || "")}... (赞${n.liked_count})`)
    .join("\n");

  const commentsText = xhsData.sampleComments
    .slice(0, 20)
    .map((c, i) => `${i + 1}. "${sanitizeForPrompt(c.content?.slice(0, 80) || "")}" - ${c.ip_location || "未知"}`)
    .join("\n");

  const competitorText = competitorData
    .slice(0, 15)
    .map((c, i) => `${i + 1}. ${sanitizeForPrompt(c.title.slice(0, 50))} | ${sanitizeForPrompt(c.snippet.slice(0, 100))} | 来源: ${c.source}`)
    .join("\n");

  const prompt = `你是一名数据分析师。请从以下原始数据中提取结构化摘要，用于后续深度分析。

**待分析的创业想法**: "${sanitizeForPrompt(idea)}"

**原始数据:**

[小红书笔记 - ${xhsData.totalNotes}条相关内容]
${notesText || "暂无数据"}

[用户评论]
${commentsText || "暂无评论"}

[竞品搜索结果]
${competitorText || "暂无竞品数据"}

**请提取以下结构化信息:**

1. **痛点聚类**: 从评论中识别用户痛点，分类为 complaint(吐槽)/question(求助)/recommendation(推荐)/comparison(比较)
2. **竞品分类**: 将竞品按品类聚合，识别头部玩家
3. **情感分布**: 统计正面/负面/中性比例，提取主要主题
4. **市场信号**: 识别关键市场趋势和机会

仅返回 JSON 格式（无markdown、无解释）:
{
  "painPointClusters": [
    {"theme": "痛点主题", "frequency": 5, "sampleQuotes": ["原始评论1", "原始评论2"], "type": "complaint"}
  ],
  "competitorMatrix": [
    {"category": "品类名称", "count": 3, "topPlayers": ["品牌1", "品牌2"], "commonPricing": "100-500元"}
  ],
  "sentimentBreakdown": {
    "positive": 40,
    "negative": 35,
    "neutral": 25,
    "topPositiveThemes": ["好评主题1"],
    "topNegativeThemes": ["差评主题1"]
  },
  "marketSignals": [
    {"signal": "信号描述", "evidence": "数据证据", "implication": "对创业的启示", "confidence": 80}
  ],
  "keyInsights": ["关键洞察1", "关键洞察2", "关键洞察3"]
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
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      console.error("Data summarizer API error:", response.status);
      return createBasicSummary(idea, xhsData, competitorData, dataQuality);
    }

    const responseData = await response.json();
    const content = responseData.choices[0]?.message?.content || "";

    try {
      const parsed = parseSummaryJson(content);
      
      // Analyze cross-platform resonance if we have multi-platform data
      const crossPlatformResonance = analyzeCrossPlatformResonance(xhsData.sampleComments);
      
      return {
        painPointClusters: parsed.painPointClusters || [],
        competitorMatrix: parsed.competitorMatrix || [],
        sentimentBreakdown: parsed.sentimentBreakdown || {
          positive: 33,
          negative: 33,
          neutral: 34,
          topPositiveThemes: [],
          topNegativeThemes: []
        },
        marketSignals: parsed.marketSignals || [],
        dataQuality,
        keyInsights: parsed.keyInsights || [],
        crossPlatformResonance: crossPlatformResonance.length > 0 ? crossPlatformResonance : undefined
      };
    } catch (e) {
      console.error("Summary JSON parse failed:", e);
      return createBasicSummary(idea, xhsData, competitorData, dataQuality);
    }
  } catch (e) {
    console.error("Data summarization failed:", e);
    return createBasicSummary(idea, xhsData, competitorData, dataQuality);
  }
}

/**
 * Calculate data quality score
 */
function calculateDataQuality(xhsData: XhsData, competitorData: SearchResult[]): DataQuality {
  // Sample size score (0-40 points)
  const totalSamples = xhsData.sampleNotes.length + xhsData.sampleComments.length + competitorData.length;
  const sampleSizeScore = Math.min(40, totalSamples * 2);

  // Diversity score (0-30 points) - multiple data sources
  let diversityScore = 0;
  if (xhsData.sampleNotes.length > 0) diversityScore += 10;
  if (xhsData.sampleComments.length > 0) diversityScore += 10;
  if (competitorData.length > 0) diversityScore += 10;

  // Engagement score (0-30 points) - based on engagement metrics
  const avgEngagement = xhsData.avgLikes + xhsData.avgComments + xhsData.avgCollects;
  const engagementScore = Math.min(30, avgEngagement / 10);

  const totalScore = Math.round(sampleSizeScore + diversityScore + engagementScore);

  let recommendation = "";
  if (totalScore >= 70) {
    recommendation = "数据充足，分析结果可信度高";
  } else if (totalScore >= 40) {
    recommendation = "数据量中等，建议配置更多搜索渠道以提升分析质量";
  } else if (totalScore >= 20) {
    recommendation = "数据较少，分析结果仅供参考";
  } else {
    recommendation = "数据稀缺，建议检查API配置或更换关键词";
  }

  return {
    score: totalScore,
    sampleSize: totalSamples,
    diversityScore,
    recencyScore: 70, // Default, would need timestamp analysis
    recommendation
  };
}

/**
 * Create basic summary when AI is unavailable
 */
function createBasicSummary(
  idea: string,
  xhsData: XhsData,
  competitorData: SearchResult[],
  dataQuality: DataQuality
): DataSummary {
  // Extract basic patterns from comments
  const painPoints: PainPointCluster[] = [];
  const commentTexts = xhsData.sampleComments.map(c => c.content || "");
  
  // Simple keyword detection
  const complaintKeywords = ["贵", "差", "不好", "问题", "失望", "坑"];
  const questionKeywords = ["怎么", "如何", "求", "有没有", "推荐"];
  
  const complaints = commentTexts.filter(t => complaintKeywords.some(k => t.includes(k)));
  const questions = commentTexts.filter(t => questionKeywords.some(k => t.includes(k)));

  if (complaints.length > 0) {
    painPoints.push({
      theme: "用户吐槽",
      frequency: complaints.length,
      sampleQuotes: complaints.slice(0, 3),
      type: 'complaint'
    });
  }

  if (questions.length > 0) {
    painPoints.push({
      theme: "用户求助",
      frequency: questions.length,
      sampleQuotes: questions.slice(0, 3),
      type: 'question'
    });
  }

  // Group competitors by source
  const competitorMatrix: CompetitorCategory[] = [];
  const sourceGroups: Record<string, SearchResult[]> = {};
  
  for (const comp of competitorData) {
    const source = comp.source || "其他";
    if (!sourceGroups[source]) sourceGroups[source] = [];
    sourceGroups[source].push(comp);
  }

  for (const [source, items] of Object.entries(sourceGroups)) {
    competitorMatrix.push({
      category: source,
      count: items.length,
      topPlayers: items.slice(0, 3).map(i => i.title.slice(0, 20))
    });
  }

  return {
    painPointClusters: painPoints,
    competitorMatrix,
    sentimentBreakdown: {
      positive: 33,
      negative: 33,
      neutral: 34,
      topPositiveThemes: [],
      topNegativeThemes: []
    },
    marketSignals: [
      {
        signal: `发现${xhsData.totalNotes}条相关内容`,
        evidence: `平均${xhsData.avgLikes}点赞`,
        implication: xhsData.totalNotes > 100 ? "市场存在一定关注度" : "市场关注度较低",
        confidence: dataQuality.score
      }
    ],
    dataQuality,
    keyInsights: [
      `共收集${dataQuality.sampleSize}条数据样本`,
      dataQuality.recommendation
    ]
  };
}

/**
 * Create minimal summary when data is very sparse
 */
function createSparseSummary(
  idea: string,
  xhsData: XhsData,
  competitorData: SearchResult[],
  dataQuality: DataQuality
): DataSummary {
  return {
    painPointClusters: [],
    competitorMatrix: [],
    sentimentBreakdown: {
      positive: 33,
      negative: 33,
      neutral: 34,
      topPositiveThemes: [],
      topNegativeThemes: []
    },
    marketSignals: [
      {
        signal: "数据不足",
        evidence: `仅收集到${dataQuality.sampleSize}条数据`,
        implication: "建议配置Tikhub Token和搜索API以获取更多数据",
        confidence: 20
      }
    ],
    dataQuality,
    keyInsights: [
      "数据量不足，无法进行有效分析",
      "建议检查API配置或调整搜索关键词"
    ]
  };
}

/**
 * Parse JSON from AI response
 */
function parseSummaryJson(text: string): Partial<DataSummary> {
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
  return JSON.parse(jsonStr);
}

// ============ Cross-Platform Resonance Analysis ============

/**
 * Pain point keywords for detection
 */
const PAIN_KEYWORDS = {
  complaint: ["困扰", "太难", "差", "坑", "失望", "难用", "垃圾", "骗", "后悔", "问题", "不好", "不行"],
  question: ["怎么", "如何", "求", "有没有", "谁知道", "想问", "请问", "为什么"],
  recommendation: ["推荐", "好用", "必买", "神器", "宝藏", "种草"],
  comparison: ["比较", "对比", "还是", "哪个好", "选择"]
};

/**
 * Analyze cross-platform resonance to identify pain points 
 * that appear across multiple platforms (high-intensity needs)
 */
export function analyzeCrossPlatformResonance(
  comments: CommentWithPlatform[]
): CrossPlatformResonance[] {
  // Group comments by platform
  const xhsComments = comments.filter(c => c._platform === 'xiaohongshu');
  const dyComments = comments.filter(c => c._platform === 'douyin');

  // If we don't have multi-platform data, skip analysis
  if (xhsComments.length === 0 || dyComments.length === 0) {
    return [];
  }

  // Extract key phrases from each platform
  const xhsPhrases = extractKeyPhrases(xhsComments, 'xiaohongshu');
  const dyPhrases = extractKeyPhrases(dyComments, 'douyin');

  // Find common phrases across platforms
  const resonanceMap = new Map<string, CrossPlatformResonance>();

  // Process XHS phrases
  for (const [phrase, data] of xhsPhrases.entries()) {
    if (!resonanceMap.has(phrase)) {
      resonanceMap.set(phrase, {
        keyword: phrase,
        platforms: ['xiaohongshu'],
        totalMentions: data.count,
        xhsMentions: data.count,
        douyinMentions: 0,
        sentiment: data.sentiment,
        isHighIntensity: false,
        sampleQuotes: data.quotes.map(q => ({ platform: 'xiaohongshu', quote: q }))
      });
    }
  }

  // Process Douyin phrases and merge with XHS
  for (const [phrase, data] of dyPhrases.entries()) {
    const existing = resonanceMap.get(phrase);
    if (existing) {
      // Found in both platforms - this is a high-intensity resonance
      existing.platforms.push('douyin');
      existing.totalMentions += data.count;
      existing.douyinMentions = data.count;
      existing.isHighIntensity = true;
      existing.sampleQuotes.push(...data.quotes.map(q => ({ platform: 'douyin', quote: q })));
    } else {
      resonanceMap.set(phrase, {
        keyword: phrase,
        platforms: ['douyin'],
        totalMentions: data.count,
        xhsMentions: 0,
        douyinMentions: data.count,
        sentiment: data.sentiment,
        isHighIntensity: false,
        sampleQuotes: data.quotes.map(q => ({ platform: 'douyin', quote: q }))
      });
    }
  }

  // Sort by high-intensity first, then by total mentions
  const results = Array.from(resonanceMap.values())
    .filter(r => r.totalMentions >= 2) // At least 2 mentions
    .sort((a, b) => {
      if (a.isHighIntensity !== b.isHighIntensity) {
        return a.isHighIntensity ? -1 : 1;
      }
      return b.totalMentions - a.totalMentions;
    })
    .slice(0, 10); // Top 10 resonance points

  return results;
}

interface PhraseData {
  count: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  quotes: string[];
}

/**
 * Extract key pain point phrases from comments
 */
function extractKeyPhrases(
  comments: CommentWithPlatform[],
  platform: string
): Map<string, PhraseData> {
  const phrases = new Map<string, PhraseData>();

  for (const comment of comments) {
    const content = comment.content || comment.text || "";
    if (content.length < 5 || content.length > 200) continue;

    // Detect pain point type and extract phrase
    for (const [type, keywords] of Object.entries(PAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          // Use the keyword as the phrase key
          const existing = phrases.get(keyword);
          const sentiment = type === 'recommendation' ? 'positive' 
                         : (type === 'complaint' ? 'negative' : 'neutral');
          
          if (existing) {
            existing.count++;
            if (existing.quotes.length < 3) {
              existing.quotes.push(content.slice(0, 80));
            }
          } else {
            phrases.set(keyword, {
              count: 1,
              sentiment,
              quotes: [content.slice(0, 80)]
            });
          }
          break; // Only count once per comment
        }
      }
    }
  }

  return phrases;
}

/**
 * Prioritize negative/complaint comments for pain point mining
 * Returns sorted comments with complaints first
 */
export function prioritizeNegativeComments<T extends CommentWithPlatform>(
  comments: T[]
): T[] {
  const negativeKeywords = ["差", "坑", "失望", "不好", "难用", "垃圾", "骗", "后悔", "问题", "困扰"];
  const questionKeywords = ["怎么", "如何", "求", "有没有", "谁知道"];

  return [...comments].sort((a, b) => {
    const aContent = a.content || a.text || "";
    const bContent = b.content || b.text || "";

    const aScore = calculatePriorityScore(aContent, negativeKeywords, questionKeywords);
    const bScore = calculatePriorityScore(bContent, negativeKeywords, questionKeywords);

    return bScore - aScore; // Higher score first
  });
}

function calculatePriorityScore(
  content: string,
  negativeKeywords: string[],
  questionKeywords: string[]
): number {
  let score = 0;
  
  for (const kw of negativeKeywords) {
    if (content.includes(kw)) score += 3;
  }
  
  for (const kw of questionKeywords) {
    if (content.includes(kw)) score += 2;
  }
  
  // Questions with ? get extra points
  if (content.includes("?") || content.includes("？")) {
    score += 1;
  }
  
  return score;
}
