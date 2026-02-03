/**
 * Streaming Validation Edge Function (v2)
 * 
 * 优化版本 - 集成:
 * - Jina Reader 网页清洗
 * - 分层摘要系统
 * - 竞品名称提取 + 二次深度搜索
 * - 热门话题缓存
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
import { cleanCompetitorPages, isCleanableUrl } from "../_shared/jina-reader.ts";
import { summarizeBatch, aggregateSummaries, type SummaryConfig } from "../_shared/summarizer.ts";
import { 
  extractCompetitorNames, 
  searchCompetitorDetails, 
  mergeSearchResults,
  type SearchResult,
  type LLMConfig 
} from "../_shared/competitor-extractor.ts";

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

// 优化后的进度阶段
const STAGES = {
  INIT: { progress: 5, message: '初始化验证...' },
  KEYWORDS: { progress: 10, message: '智能扩展关键词...' },
  CACHE_CHECK: { progress: 12, message: '检查缓存数据...' },
  CRAWL_START: { progress: 18, message: '开始抓取社媒数据...' },
  CRAWL_XHS: { progress: 25, message: '抓取小红书数据...' },
  CRAWL_DY: { progress: 32, message: '抓取抖音数据...' },
  CRAWL_DONE: { progress: 38, message: '社媒数据抓取完成' },
  SEARCH: { progress: 45, message: '搜索竞品信息...' },
  JINA_CLEAN: { progress: 52, message: '清洗网页内容...' },
  EXTRACT_COMPETITORS: { progress: 58, message: '提取竞品名称...' },
  DEEP_SEARCH: { progress: 64, message: '二次深度搜索...' },
  SUMMARIZE_L1: { progress: 72, message: '生成数据摘要...' },
  SUMMARIZE_L2: { progress: 78, message: '聚合分析洞察...' },
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

      // ============ Keyword Expansion ============
      const xhsKeywords = await expandKeywordsSimple(idea, tags, config);
      const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);

      // ============ Cache Check ============
      await sendProgress('CACHE_CHECK');
      let usedCache = false;
      let cachedTopicId: string | null = null;

      try {
        const { data: cacheResult } = await supabase.rpc('get_cached_topic_data', {
          p_keyword: xhsSearchTerm
        });

        if (cacheResult?.[0]?.is_valid) {
          console.log('[Cache] Hit for keyword:', xhsSearchTerm);
          usedCache = true;
          cachedTopicId = cacheResult[0].topic_id;
          
          // 更新命中计数
          await supabase.rpc('increment_cache_hit', { p_topic_id: cachedTopicId });
        }
      } catch (e) {
        console.log('[Cache] Check failed, proceeding without cache:', e);
      }

      // ============ TikHub Quota Check ============
      const mode = config?.mode || 'quick';
      const enableXhs = config?.enableXiaohongshu ?? true;
      const enableDy = config?.enableDouyin ?? false;
      
      const userProvidedTikhub = !!config?.tikhubToken;
      let tikhubToken = config?.tikhubToken;
      
      if (!userProvidedTikhub && !usedCache) {
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
        
        tikhubToken = Deno.env.get("TIKHUB_TOKEN");
      }

      let socialData = {
        totalNotes: 0,
        avgLikes: 0,
        avgComments: 0,
        avgCollects: 0,
        sampleNotes: [] as any[],
        sampleComments: [] as any[]
      };

      // ============ Social Media Crawling ============
      if (!usedCache && tikhubToken && (enableXhs || enableDy)) {
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

      // ============ Competitor Search + Jina Clean + Deep Search ============
      let competitorData: SearchResult[] = [];
      let extractedCompetitors: any[] = [];
      
      const searchKeys = {
        tavily: Deno.env.get("TAVILY_API_KEY"),
        bocha: Deno.env.get("BOCHA_API_KEY"),
        you: Deno.env.get("YOU_API_KEY"),
      };
      
      const hasAnySearchKey = searchKeys.tavily || searchKeys.bocha || searchKeys.you;

      if (hasAnySearchKey && !usedCache) {
        // 初次搜索
        await sendProgress('SEARCH');
        const rawCompetitors = await searchCompetitorsSimple(idea, searchKeys);

        // Jina Reader 清洗
        await sendProgress('JINA_CLEAN');
        const cleanableUrls = rawCompetitors
          .filter(c => c.url && isCleanableUrl(c.url))
          .slice(0, 6)
          .map(c => c.url);

        let cleanedPages: any[] = [];
        if (cleanableUrls.length > 0) {
          try {
            cleanedPages = await cleanCompetitorPages(cleanableUrls, 3, 4000);
          } catch (e) {
            console.error('[Jina] Batch clean error:', e);
          }
        }

        // 合并清洗后的内容
        competitorData = rawCompetitors.map(comp => {
          const cleaned = cleanedPages.find(p => p.url === comp.url);
          return {
            ...comp,
            cleanedContent: cleaned?.success ? cleaned.markdown : comp.snippet,
            hasCleanedContent: cleaned?.success || false
          };
        });

        // 提取竞品名称
        await sendProgress('EXTRACT_COMPETITORS');
        const llmConfig: LLMConfig = {
          apiKey: Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || "",
          baseUrl: (Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "").replace(/\/chat\/completions$/, ""),
          model: Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview"
        };

        if (llmConfig.apiKey) {
          try {
            extractedCompetitors = await extractCompetitorNames(competitorData, idea, llmConfig);
            console.log('[Competitors] Extracted:', extractedCompetitors.map(c => c.name));
          } catch (e) {
            console.error('[Competitors] Extract error:', e);
          }
        }

        // 二次深度搜索
        if (extractedCompetitors.length > 0) {
          await sendProgress('DEEP_SEARCH');
          try {
            const deepResults = await searchCompetitorDetails(extractedCompetitors, searchKeys);
            competitorData = mergeSearchResults(competitorData, deepResults);
            console.log('[DeepSearch] Added', deepResults.length, 'results');
          } catch (e) {
            console.error('[DeepSearch] Error:', e);
          }
        }
      }

      // ============ Tiered Summarization ============
      await sendProgress('SUMMARIZE_L1');
      
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
        const socialItems = socialData.sampleNotes
          .slice(0, 8)
          .map(note => ({
            content: `${note.title || ''}\n${note.desc || ''}`.trim(),
            type: 'social_post' as const
          }))
          .filter(item => item.content.length > 20);

        const competitorItems = competitorData
          .slice(0, 5)
          .map(comp => ({
            content: comp.cleanedContent || comp.snippet || '',
            type: 'competitor_page' as const
          }))
          .filter(item => item.content.length > 50);

        if (socialItems.length > 0 || competitorItems.length > 0) {
          try {
            const allItems = [...socialItems, ...competitorItems];
            const summaries = await summarizeBatch(allItems, summaryConfig, 4);
            
            socialSummaries = summaries
              .filter(s => s.type === 'social_post')
              .map(s => s.content);
            competitorSummaries = summaries
              .filter(s => s.type === 'competitor_page')
              .map(s => s.content);

            console.log('[Summarizer] L1 done:', socialSummaries.length, 'social,', competitorSummaries.length, 'competitor');
          } catch (e) {
            console.error('[Summarizer] L1 error:', e);
          }
        }

        // Layer 2: 聚合摘要
        await sendProgress('SUMMARIZE_L2');
        if (socialSummaries.length > 0 || competitorSummaries.length > 0) {
          try {
            aggregatedInsights = await aggregateSummaries(socialSummaries, competitorSummaries, summaryConfig);
            console.log('[Summarizer] L2 done');
          } catch (e) {
            console.error('[Summarizer] L2 error:', e);
          }
        }
      }

      // ============ AI Analysis ============
      await sendProgress('ANALYZE');

      const aiResult = await analyzeWithAIEnhanced(
        idea, 
        tags || [], 
        socialData, 
        competitorData,
        aggregatedInsights,
        extractedCompetitors
      );

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
        data_summary: {
          socialSummaries,
          competitorSummaries,
          aggregatedInsights,
          extractedCompetitors: extractedCompetitors.map(c => c.name)
        },
        data_quality_score: calculateDataQualityScore(socialData, competitorData),
        keywords_used: { coreKeywords: xhsKeywords },
      };

      let saved = false;
      for (let i = 0; i < 3 && !saved; i++) {
        const { error } = await supabase.from("validation_reports").insert(reportData);
        if (!error) saved = true;
        else await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }

      if (!saved) throw new Error("Failed to save report");

      // ============ Consume TikHub Quota ============
      if (!userProvidedTikhub && !usedCache) {
        const { error: consumeError } = await supabase.rpc('use_tikhub_quota', {
          p_user_id: user.id
        });
        if (consumeError) {
          console.error('Failed to consume quota:', consumeError);
        }
      }

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

// ============ Helper Functions ============

async function expandKeywordsSimple(idea: string, tags: string[], config: RequestConfig): Promise<string[]> {
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
      totalNotes: notes.length * 100,
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

async function searchCompetitorsSimple(query: string, keys: any): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchPromises: Promise<SearchResult[]>[] = [];
  
  if (keys.tavily) {
    searchPromises.push((async () => {
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
          return (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content || "",
            source: "Tavily"
          }));
        }
      } catch (e) {
        console.error("[Tavily Simple] Error:", e);
      }
      return [];
    })());
  }

  if (keys.bocha) {
    searchPromises.push((async () => {
      try {
        const res = await fetch("https://api.bochaai.com/v1/web-search", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keys.bocha}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: query,
            freshness: "noLimit",
            summary: true,
            count: 5,
            market: "zh-CN",
            language: "zh"
          })
        });
        if (res.ok) {
          const data = await res.json();
          return (data.data?.webPages?.value || []).map((r: any) => ({
            title: r.name || r.title,
            url: r.url,
            snippet: r.snippet || r.description || "",
            source: "Bocha"
          }));
        }
      } catch (e) {
        console.error("[Bocha Simple] Error:", e);
      }
      return [];
    })());
  }

  if (keys.you) {
    searchPromises.push((async () => {
      try {
        const res = await fetch(`https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=5&country=CN`, {
          headers: { "X-API-Key": keys.you }
        });
        if (res.ok) {
          const data = await res.json();
          return (data.results?.web || []).map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || r.snippets?.[0] || "",
            source: "You.com"
          }));
        }
      } catch (e) {
        console.error("[You.com Simple] Error:", e);
      }
      return [];
    })());
  }

  const allResults = await Promise.all(searchPromises);
  for (const r of allResults) {
    results.push(...r);
  }

  return results;
}

// 增强版 AI 分析 - 使用聚合摘要
async function analyzeWithAIEnhanced(
  idea: string, 
  tags: string[], 
  socialData: any, 
  competitors: SearchResult[],
  aggregatedInsights: { marketInsight: string; competitiveInsight: string; keyFindings: string[] },
  extractedCompetitors: any[]
) {
  const apiKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  const baseUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
  const model = Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview";

  let cleanBaseUrl = baseUrl.replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  // 构建更丰富的上下文
  const competitorNames = extractedCompetitors.map(c => c.name).join(', ') || '未识别';
  const marketInsight = aggregatedInsights.marketInsight || '待分析';
  const competitiveInsight = aggregatedInsights.competitiveInsight || '待分析';

  const prompt = `你是一名资深VC合伙人。基于以下经过整理的市场数据，评估创业想法的可行性。

**创业想法**: "${idea}"
**标签**: ${tags.join(', ') || '无'}

**市场数据摘要**:
- 社媒内容数量: ${socialData.totalNotes}条
- 平均互动量: ${socialData.avgLikes}赞

**市场需求洞察**:
${marketInsight}

**竞争格局洞察**:
${competitiveInsight}

**识别的竞品**: ${competitorNames}

**关键发现**:
${aggregatedInsights.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n') || '暂无'}

请输出JSON格式的评估报告:
{
  "overallScore": 0-100,
  "overallVerdict": "一句话总结",
  "marketAnalysis": {
    "targetAudience": "目标用户群",
    "marketSize": "市场规模评估",
    "competitionLevel": "竞争程度"
  },
  "sentimentAnalysis": {"positive": 33, "neutral": 34, "negative": 33},
  "aiAnalysis": {
    "feasibilityScore": 0-100,
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["劣势1", "劣势2"],
    "risks": ["风险1", "风险2"],
    "suggestions": ["建议1", "建议2"]
  },
  "persona": {
    "name": "典型用户名",
    "role": "职业/角色",
    "age": "年龄段",
    "painPoints": ["痛点1", "痛点2"],
    "goals": ["目标1", "目标2"]
  },
  "dimensions": [
    {"dimension": "需求痛感", "score": 50, "reason": "理由"},
    {"dimension": "市场规模", "score": 50, "reason": "理由"},
    {"dimension": "竞争壁垒", "score": 50, "reason": "理由"},
    {"dimension": "PMF潜力", "score": 50, "reason": "理由"}
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
    
    const cleaned = content.replace(/```json/gi, "```").replace(/```/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1) throw new Error("No JSON");
    
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    console.error("[AI Enhanced] Error:", e);
    return {
      overallScore: 50,
      overallVerdict: "AI分析服务暂时不可用",
      marketAnalysis: {},
      sentimentAnalysis: { positive: 33, neutral: 34, negative: 33 },
      aiAnalysis: {},
      persona: null,
      dimensions: [
        { dimension: "需求痛感", score: 50, reason: "待分析" },
        { dimension: "市场规模", score: 50, reason: "待分析" },
        { dimension: "竞争壁垒", score: 50, reason: "待分析" },
        { dimension: "PMF潜力", score: 50, reason: "待分析" }
      ]
    };
  }
}

// 计算数据质量分数
function calculateDataQualityScore(socialData: any, competitorData: any[]): number {
  let score = 0;
  
  // 社媒数据质量 (最高 50 分)
  if (socialData.sampleNotes.length >= 5) score += 20;
  else if (socialData.sampleNotes.length >= 2) score += 10;
  
  if (socialData.totalNotes >= 100) score += 15;
  else if (socialData.totalNotes >= 20) score += 8;
  
  if (socialData.avgLikes >= 100) score += 15;
  else if (socialData.avgLikes >= 20) score += 8;
  
  // 竞品数据质量 (最高 50 分)
  const cleanedCompetitors = competitorData.filter((c: any) => c.hasCleanedContent);
  if (cleanedCompetitors.length >= 3) score += 25;
  else if (cleanedCompetitors.length >= 1) score += 12;
  
  if (competitorData.length >= 5) score += 15;
  else if (competitorData.length >= 2) score += 8;
  
  const deepSearchResults = competitorData.filter((c: any) => c.source?.includes('Deep'));
  if (deepSearchResults.length >= 2) score += 10;
  
  return Math.min(100, score);
}
