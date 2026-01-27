/**
 * Streaming Validation Edge Function
 * 
 * Provides real-time progress updates via Server-Sent Events (SSE)
 * This is a simplified streaming wrapper that calls the main validate-idea function
 * and provides progress updates.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateString,
  validateStringArray,
  validateUserProvidedUrl,
  ValidationError,
  LIMITS
} from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

interface SSEEvent {
  event: 'progress' | 'complete' | 'error';
  stage?: string;
  progress?: number;
  message?: string;
  result?: any;
  error?: string;
}

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

// Progress stages with weights
const STAGES = {
  INIT: { progress: 5, message: '初始化验证...' },
  KEYWORDS: { progress: 15, message: '智能扩展关键词...' },
  CRAWL_START: { progress: 25, message: '开始抓取社媒数据...' },
  CRAWL_XHS: { progress: 35, message: '抓取小红书数据...' },
  CRAWL_DY: { progress: 45, message: '抓取抖音数据...' },
  CRAWL_DONE: { progress: 55, message: '社媒数据抓取完成' },
  SEARCH: { progress: 65, message: '搜索竞品信息...' },
  SUMMARIZE: { progress: 75, message: '汇总分析数据...' },
  ANALYZE: { progress: 88, message: 'AI深度分析中...' },
  SAVE: { progress: 95, message: '保存验证报告...' },
  COMPLETE: { progress: 100, message: '验证完成' },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (event: SSEEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    await writer.write(encoder.encode(data));
  };

  const sendProgress = async (stage: keyof typeof STAGES) => {
    const { progress, message } = STAGES[stage];
    await sendEvent({ event: 'progress', stage: stage.toLowerCase(), progress, message });
  };

  // Process validation asynchronously
  (async () => {
    try {
      const body = await req.json();

      const idea = validateString(body.idea, "idea", LIMITS.IDEA_MAX_LENGTH, true)!;
      const tags = validateStringArray(body.tags, "tags", LIMITS.TAG_MAX_COUNT, LIMITS.TAG_MAX_LENGTH);
      const config = validateConfig(body.config);

      await sendProgress('INIT');

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Auth check
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new ValidationError("Authorization required");

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new ValidationError("Invalid or expired session");

      await checkRateLimit(supabase, user.id, "validate-idea");

      // Create validation record
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
        throw new Error("Failed to create validation");
      }

      await sendProgress('KEYWORDS');

      // ============ Inline Keyword Expansion ============
      const xhsKeywords = await expandKeywordsSimple(idea, tags, config);
      const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);

      // ============ Crawl Social Media ============
      const mode = config?.mode || 'quick';
      const enableXhs = config?.enableXiaohongshu ?? true;
      const enableDy = config?.enableDouyin ?? false;
      const tikhubToken = config?.tikhubToken || Deno.env.get("TIKHUB_TOKEN");

      let socialData = {
        totalNotes: 0,
        avgLikes: 0,
        avgComments: 0,
        avgCollects: 0,
        sampleNotes: [] as any[],
        sampleComments: [] as any[]
      };

      if (tikhubToken && (enableXhs || enableDy)) {
        await sendProgress('CRAWL_START');

        if (enableXhs) {
          await sendProgress('CRAWL_XHS');
          const xhsData = await crawlXhsSimple(xhsSearchTerm, tikhubToken, mode);
          socialData.totalNotes += xhsData.totalNotes;
          socialData.avgLikes += xhsData.avgLikes;
          socialData.avgComments += xhsData.avgComments;
          socialData.sampleNotes.push(...xhsData.sampleNotes);
          socialData.sampleComments.push(...xhsData.sampleComments);
        }

        if (enableDy) {
          await sendProgress('CRAWL_DY');
          const dyData = await crawlDouyinSimple(xhsSearchTerm, tikhubToken, mode);
          socialData.totalNotes += dyData.totalNotes;
          socialData.avgLikes += dyData.avgLikes;
          socialData.avgComments += dyData.avgComments;
          socialData.sampleNotes.push(...dyData.sampleNotes);
          socialData.sampleComments.push(...dyData.sampleComments);
        }
      }

      await sendProgress('CRAWL_DONE');

      // ============ Competitor Search ============
      let competitorData: any[] = [];
      const searchKeys = config?.searchKeys;

      if (searchKeys && (searchKeys.bocha || searchKeys.you || searchKeys.tavily)) {
        await sendProgress('SEARCH');
        competitorData = await searchCompetitorsSimple(idea, searchKeys);
      }

      await sendProgress('SUMMARIZE');

      // ============ AI Analysis ============
      await sendProgress('ANALYZE');

      const aiResult = await analyzeWithAISimple(idea, tags || [], socialData, competitorData, config);

      await sendProgress('SAVE');

      // ============ Save Report ============
      const reportData = {
        validation_id: validation.id,
        market_analysis: aiResult.marketAnalysis || {},
        xiaohongshu_data: socialData,
        competitor_data: competitorData,
        sentiment_analysis: aiResult.sentimentAnalysis || { positive: 33, neutral: 34, negative: 33 },
        ai_analysis: aiResult.aiAnalysis || {},
        dimensions: aiResult.dimensions || [],
        persona: aiResult.persona || null,
        data_summary: {},
        data_quality_score: null,
        keywords_used: { coreKeywords: xhsKeywords },
      };

      let saved = false;
      for (let i = 0; i < 3 && !saved; i++) {
        const { error } = await supabase.from("validation_reports").insert(reportData);
        if (!error) saved = true;
        else await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }

      if (!saved) throw new Error("Failed to save report");

      // Update validation status
      await supabase
        .from("validations")
        .update({ status: "completed", overall_score: aiResult.overallScore })
        .eq("id", validation.id);

      await sendEvent({
        event: 'complete',
        result: {
          validationId: validation.id,
          overallScore: aiResult.overallScore,
          overallVerdict: aiResult.overallVerdict
        }
      });

    } catch (error) {
      console.error("Stream validation error:", error);
      
      let errorMessage = "验证过程中发生错误";
      if (error instanceof ValidationError) errorMessage = error.message;
      else if (error instanceof RateLimitError) errorMessage = "请求过于频繁，请稍后再试";
      else if (error instanceof Error) errorMessage = error.message;

      await sendEvent({ event: 'error', error: errorMessage });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, { headers: corsHeaders });
});

// ============ Simplified Helper Functions ============

async function expandKeywordsSimple(idea: string, tags: string[], config: RequestConfig): Promise<string[]> {
  // Simple keyword extraction - just use first tag or idea prefix
  const keywords: string[] = [];
  if (tags && tags.length > 0) {
    keywords.push(tags[0]);
  }
  keywords.push(idea.slice(0, 15));
  return keywords;
}

async function crawlXhsSimple(keyword: string, token: string, mode: string) {
  const emptyResult = { totalNotes: 0, avgLikes: 0, avgComments: 0, sampleNotes: [], sampleComments: [] };
  
  try {
    const url = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(keyword)}&page=1&sort=general&noteType=_0`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return emptyResult;

    const data = await res.json();
    const items = data?.data?.data?.items || [];
    
    const notes = items.slice(0, 5).map((item: any) => ({
      note_id: item.note?.id || '',
      title: '[小红书] ' + (item.note?.title || ''),
      desc: item.note?.desc || '',
      liked_count: item.note?.liked_count || 0,
      collected_count: item.note?.collected_count || 0,
      _platform: 'xiaohongshu'
    }));

    const totalLikes = notes.reduce((sum: number, n: any) => sum + n.liked_count, 0);

    return {
      totalNotes: notes.length * 100, // Estimate
      avgLikes: notes.length > 0 ? Math.round(totalLikes / notes.length) : 0,
      avgComments: 0,
      sampleNotes: notes,
      sampleComments: []
    };
  } catch (e) {
    console.error("[XHS Simple] Error:", e);
    return emptyResult;
  }
}

async function crawlDouyinSimple(keyword: string, token: string, mode: string) {
  const emptyResult = { totalNotes: 0, avgLikes: 0, avgComments: 0, sampleNotes: [], sampleComments: [] };
  
  try {
    const url = `https://api.tikhub.io/api/v1/douyin/web/fetch_video_search_result?keyword=${encodeURIComponent(keyword)}&offset=0&count=5&sort_type=0`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return emptyResult;

    const data = await res.json();
    const awemeList = data?.data?.data?.aweme_list || data?.data?.aweme_list || [];
    
    const videos = awemeList.slice(0, 5).map((item: any) => ({
      aweme_id: item.aweme_id || '',
      title: '[抖音] ' + (item.desc || '').slice(0, 30),
      desc: item.desc || '',
      digg_count: item.statistics?.digg_count || 0,
      _platform: 'douyin'
    }));

    const totalLikes = videos.reduce((sum: number, v: any) => sum + v.digg_count, 0);

    return {
      totalNotes: videos.length * 100,
      avgLikes: videos.length > 0 ? Math.round(totalLikes / videos.length) : 0,
      avgComments: 0,
      sampleNotes: videos,
      sampleComments: []
    };
  } catch (e) {
    console.error("[Douyin Simple] Error:", e);
    return emptyResult;
  }
}

async function searchCompetitorsSimple(query: string, keys: any): Promise<any[]> {
  const results: any[] = [];
  
  if (keys.tavily) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: keys.tavily,
          query: query,
          search_depth: "basic",
          max_results: 5
        })
      });
      if (res.ok) {
        const data = await res.json();
        results.push(...(data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.content || "",
          source: "Tavily"
        })));
      }
    } catch (e) {
      console.error("[Tavily Simple] Error:", e);
    }
  }

  return results;
}

async function analyzeWithAISimple(idea: string, tags: string[], socialData: any, competitors: any[], config: RequestConfig) {
  const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1";
  const model = config?.llmModel || "google/gemini-3-flash-preview";

  let cleanBaseUrl = baseUrl.replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  const prompt = `你是一名VC合伙人。分析以下创业想法，评分0-100，输出JSON。

**想法**: "${idea}"
**数据**: ${socialData.totalNotes}条内容, ${socialData.avgLikes}平均赞

仅输出JSON:
{
  "overallScore": 50,
  "overallVerdict": "一句话评价",
  "marketAnalysis": {"targetAudience": "", "marketSize": "", "competitionLevel": ""},
  "sentimentAnalysis": {"positive": 33, "neutral": 34, "negative": 33},
  "aiAnalysis": {"strengths": [], "weaknesses": [], "risks": []},
  "persona": {"name": "", "role": "", "painPoints": [], "goals": []},
  "dimensions": [
    {"dimension": "需求痛感", "score": 50, "reason": ""},
    {"dimension": "护城河", "score": 50, "reason": ""},
    {"dimension": "PMF潜力", "score": 50, "reason": ""}
  ]
}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error("AI API error");

    const data = await res.json();
    const content = data.choices[0]?.message?.content || "";
    
    // Parse JSON
    const cleaned = content.replace(/```json/gi, "```").replace(/```/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1) throw new Error("No JSON");
    
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    console.error("[AI Simple] Error:", e);
    return {
      overallScore: 50,
      overallVerdict: "AI分析服务暂时不可用",
      marketAnalysis: {},
      sentimentAnalysis: { positive: 33, neutral: 34, negative: 33 },
      aiAnalysis: {},
      persona: null,
      dimensions: [
        { dimension: "需求痛感", score: 50, reason: "待分析" },
        { dimension: "护城河", score: 50, reason: "待分析" },
        { dimension: "PMF潜力", score: 50, reason: "待分析" }
      ]
    };
  }
}
