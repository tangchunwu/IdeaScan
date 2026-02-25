/**
 * Re-crawl social media data for an existing validation.
 * Attempts: self-crawler -> TikHub fallback -> raw_market_signals fallback
 * Then updates the validation_report with the new social data.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeCrawlerSource } from "../_shared/crawler-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecrawlRequest {
  validationId: string;
  config?: {
    tikhubToken?: string;
    enableXiaohongshu?: boolean;
    enableDouyin?: boolean;
    enableSelfCrawler?: boolean;
    enableTikhubFallback?: boolean;
    llmBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
    llmFallbacks?: Array<{ baseUrl: string; apiKey: string; model: string }>;
  };
}

async function fetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 1): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      console.log(`[TikHub] Attempt ${attempt + 1}: status=${resp.status} for ${url.slice(0, 80)}`);
      
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await resp.text();
        console.error(`[TikHub] Non-JSON response (${contentType}): ${text.slice(0, 200)}`);
        if (attempt < maxRetries) {
          const delay = 2000 * (attempt + 1);
          console.log(`[TikHub] Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return null;
      }
      
      if (resp.status === 504 || resp.status === 502 || resp.status === 503) {
        await resp.text(); // consume body
        if (attempt < maxRetries) {
          const delay = 2000 * (attempt + 1);
          console.log(`[TikHub] Server error ${resp.status}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return null;
      }
      
      const data = await resp.json();
      return { status: resp.status, data };
    } catch (e) {
      console.error(`[TikHub] Attempt ${attempt + 1} error:`, e);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function crawlViaTikhub(keyword: string, token: string, enableXhs: boolean, enableDy: boolean) {
  const TIKHUB_BASE = "https://api.tikhub.io";
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  
  const sampleNotes: any[] = [];
  const sampleComments: any[] = [];
  let totalEngagement = 0;

  console.log(`[TikHub] Token length: ${token.length}, prefix: ${token.slice(0, 8)}..., suffix: ...${token.slice(-6)}`);

  // Xiaohongshu search
  if (enableXhs) {
    try {
      const url = `${TIKHUB_BASE}/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(keyword)}&page=1&sort=general&note_type=0`;
      console.log(`[TikHub-XHS] Requesting: ${url}`);
      const result = await fetchWithRetry(url, headers);
      
      if (!result) {
        console.error("[TikHub-XHS] All retries failed");
      } else {
        const data = result.data;
        console.log(`[TikHub-XHS] Response code: ${data?.code}, message: ${data?.message || data?.message_zh || 'none'}`);
        
        // Log response structure for debugging
        if (data?.data) {
          console.log(`[TikHub-XHS] data.data keys: ${JSON.stringify(Object.keys(data.data)).slice(0, 300)}`);
        } else {
          console.log(`[TikHub-XHS] Full response (first 500): ${JSON.stringify(data).slice(0, 500)}`);
        }
        
        if (data?.code === 200 || result.status === 200) {
          // TikHub wraps response: { code, data: { code, data: { items/notes/... }, message }, message }
          const innerData = data?.data?.data;
          // Log full data.data structure for debugging
          console.log(`[TikHub-XHS] data.data (first 800): ${JSON.stringify(data?.data).slice(0, 800)}`);
          console.log(`[TikHub-XHS] innerData type: ${typeof innerData}, isArray: ${Array.isArray(innerData)}, keys: ${innerData && typeof innerData === 'object' && !Array.isArray(innerData) ? JSON.stringify(Object.keys(innerData)).slice(0, 300) : 'N/A'}`);

          let items: any[] = [];
          if (Array.isArray(innerData)) {
            items = innerData;
          } else if (innerData && typeof innerData === 'object') {
            // innerData could be { items: [...] } or { notes: [...] } etc.
            items = innerData.items || innerData.notes || innerData.note_list || [];
          }
          // Also check top-level data.data arrays
          if (items.length === 0) {
            items = Array.isArray(data?.data?.items) ? data.data.items : 
                    Array.isArray(data?.data?.notes) ? data.data.notes : 
                    Array.isArray(data?.data?.note_list) ? data.data.note_list : [];
          }
          if (!Array.isArray(items)) items = [];
          console.log(`[TikHub-XHS] Found ${items.length} items`);
          for (const item of items.slice(0, 14)) {
            const note = item?.note_card || item;
            sampleNotes.push({
              note_id: note.note_id || note.id || "",
              title: "[小红书] " + (note.display_title || note.title || "").slice(0, 60),
              desc: (note.desc || note.display_title || "").slice(0, 280),
              liked_count: Number(note.liked_count || note.interact_info?.liked_count || 0),
              collected_count: Number(note.collected_count || note.interact_info?.collected_count || 0),
              comments_count: Number(note.comment_count || note.interact_info?.comment_count || 0),
              user_nickname: note.user?.nickname || note.nickname || "",
              _platform: "xiaohongshu",
            });
            totalEngagement += Number(note.liked_count || 0) + Number(note.comment_count || 0);
          }
        } else {
          console.error(`[TikHub-XHS] API error: code=${data?.code}, msg=${data?.message || data?.message_zh}`);
        }
      }
    } catch (e) {
      console.error("[TikHub-XHS] Error:", e);
    }
  }

  // Douyin search
  if (enableDy) {
    try {
      const url = `${TIKHUB_BASE}/api/v1/douyin/web/fetch_general_search_result?keyword=${encodeURIComponent(keyword)}&offset=0&count=10&sort_type=0&publish_time=0&filter_duration=0&search_source=tab_search`;
      console.log(`[TikHub-DY] Requesting: ${url.slice(0, 120)}`);
      const result = await fetchWithRetry(url, headers);
      if (result?.data) {
        const data = result.data;
        const items = data?.data?.data || [];
        for (const item of items.slice(0, 10)) {
          const aweme = item?.aweme_info || item;
          if (!aweme?.desc) continue;
          sampleNotes.push({
            note_id: aweme.aweme_id || "",
            title: "[抖音] " + (aweme.desc || "").slice(0, 60),
            desc: (aweme.desc || "").slice(0, 280),
            liked_count: Number(aweme.statistics?.digg_count || 0),
            comments_count: Number(aweme.statistics?.comment_count || 0),
            collected_count: Number(aweme.statistics?.collect_count || 0),
            shared_count: Number(aweme.statistics?.share_count || 0),
            user_nickname: aweme.author?.nickname || "",
            _platform: "douyin",
          });
          totalEngagement += Number(aweme.statistics?.digg_count || 0) + Number(aweme.statistics?.comment_count || 0);
        }
      }
    } catch (e) {
      console.error("[TikHub-DY] Error:", e);
    }
  }

  if (sampleNotes.length === 0) return null;

  const avgLikes = Math.round(sampleNotes.reduce((s, n) => s + (n.liked_count || 0), 0) / sampleNotes.length);
  const avgComments = Math.round(sampleNotes.reduce((s, n) => s + (n.comments_count || 0), 0) / sampleNotes.length);
  const avgCollects = Math.round(sampleNotes.reduce((s, n) => s + (n.collected_count || 0), 0) / sampleNotes.length);

  return {
    totalNotes: sampleNotes.length,
    avgLikes, avgComments, avgCollects,
    totalEngagement,
    weeklyTrend: [], contentTypes: [],
    sampleNotes: sampleNotes.slice(0, 14),
    sampleComments,
  };
}

async function crawlFromSignals(supabase: any, keyword: string) {
  const platforms = ["xiaohongshu", "douyin"];
  const { data: signals } = await supabase
    .from("raw_market_signals")
    .select("id, content, source, likes_count, comments_count, scanned_at")
    .in("source", platforms)
    .ilike("content", `%${keyword}%`)
    .order("scanned_at", { ascending: false })
    .limit(50);

  const rows = Array.isArray(signals) ? signals : [];
  if (rows.length === 0) return null;

  const sampleNotes = rows.slice(0, 14).map((s: any) => ({
    note_id: s.id,
    title: `[${s.source}] ${String(s.content || "").slice(0, 40)}`,
    desc: String(s.content || "").slice(0, 280),
    liked_count: Number(s.likes_count || 0),
    comments_count: Number(s.comments_count || 0),
    collected_count: 0,
    _platform: s.source,
  }));

  const sampleComments = rows
    .map((s: any) => String(s.content || "").trim())
    .filter((v: string) => v.length > 10)
    .slice(0, 30)
    .map((content: string, i: number) => ({
      comment_id: `signal-${i}`,
      content: content.slice(0, 180),
      like_count: 0,
      user_nickname: "market_signal",
      _platform: rows[i]?.source || "unknown",
    }));

  const avgLikes = Math.round(sampleNotes.reduce((sum: number, n: any) => sum + (n.liked_count || 0), 0) / Math.max(1, sampleNotes.length));
  const avgComments = Math.round(sampleNotes.reduce((sum: number, n: any) => sum + (n.comments_count || 0), 0) / Math.max(1, sampleNotes.length));
  const totalEngagement = rows.reduce((sum: number, r: any) => sum + Number(r.likes_count || 0) + Number(r.comments_count || 0), 0);

  return {
    totalNotes: rows.length,
    avgLikes, avgComments, avgCollects: 0,
    totalEngagement, weeklyTrend: [], contentTypes: [],
    sampleNotes, sampleComments,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RecrawlRequest = await req.json();
    const { validationId, config } = body;

    if (!validationId) {
      return new Response(JSON.stringify({ error: "validationId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user owns this validation
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { data: validation, error: valError } = await supabase
      .from("validations")
      .select("id, idea, tags, user_id")
      .eq("id", validationId)
      .single();

    if (valError || !validation || validation.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Validation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing report
    const { data: report } = await supabase
      .from("validation_reports")
      .select("id, xiaohongshu_data, data_summary, competitor_data, ai_analysis, persona, keywords_used")
      .eq("validation_id", validationId)
      .single();

    if (!report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idea = validation.idea;
    const tags = validation.tags || [];
    // Build keyword candidates: prioritize short, generic terms
    // Strip special chars and split into shorter tokens
    const cleanTag = (t: string) => t.replace(/[「」【】（）\(\)\+\-\/\s]+/g, ' ').trim();
    const shortTokens = tags
      .flatMap((t: string) => {
        const cleaned = cleanTag(t);
        // Split long tags into 2-4 char segments
        const parts = cleaned.split(/\s+/).filter((p: string) => p.length >= 2);
        return [cleaned.slice(0, 8), ...parts.slice(0, 3)];
      })
      .filter(Boolean);
    
    // Also extract simple terms from the idea
    const ideaTokens = idea.replace(/[「」【】（）\(\)\+\-\/]+/g, ' ')
      .split(/\s+/)
      .filter((t: string) => t.length >= 2 && t.length <= 8)
      .slice(0, 3);

    const keywordCandidates = [
      ...shortTokens,
      ...ideaTokens,
      ...tags.map((t: string) => cleanTag(t).slice(0, 10)),
      idea.slice(0, 10),
    ].filter(Boolean);
    // Deduplicate and limit to 4 keywords to avoid timeout
    const uniqueKeywords = [...new Set(keywordCandidates)].slice(0, 4);

    const enableXhs = config?.enableXiaohongshu !== false;
    const enableDy = config?.enableDouyin === true;
    const enableSelfCrawler = false; // 已关闭自爬
    const tikhubToken = config?.tikhubToken || "";
    const enableTikhubFallback = config?.enableTikhubFallback !== false;

    console.log(`[Recrawl] Starting for ${validationId}, keywords: ${JSON.stringify(uniqueKeywords)}, maxKeywords=${uniqueKeywords.length}`);
    console.log(`[Recrawl] Config: selfCrawler=${enableSelfCrawler}, tikhub=${!!tikhubToken}, xhs=${enableXhs}, dy=${enableDy}`);

    let socialData: any = null;
    let source = "none";
    let usedKeyword = uniqueKeywords[0] || idea.slice(0, 20);

    // Strategy 1: Self-hosted crawler service
    if (enableSelfCrawler && Deno.env.get("CRAWLER_SERVICE_BASE_URL")) {
      console.log("[Recrawl] Attempting self-crawler...");
      const routed = await routeCrawlerSource({
        supabase, validationId, userId, query: usedKeyword,
        mode: "deep", enableXiaohongshu: enableXhs, enableDouyin: enableDy,
        source: "self_crawler", freshnessDays: 30, timeoutMs: 90000,
      });

      if (routed.socialData && (routed.socialData.sampleNotes?.length || 0) > 0) {
        socialData = routed.socialData;
        source = "self_crawler";
        console.log(`[Recrawl] Self-crawler success: ${socialData.sampleNotes?.length} notes`);
      } else {
        console.log("[Recrawl] Self-crawler returned no data");
      }
    }

    // Strategy 2: TikHub direct API — try each keyword until data found
    if (!socialData && enableTikhubFallback && tikhubToken) {
      for (const kw of uniqueKeywords) {
        console.log(`[Recrawl] Attempting TikHub with keyword: "${kw}"`);
        try {
          socialData = await crawlViaTikhub(kw, tikhubToken, enableXhs, enableDy);
          if ((socialData?.sampleNotes?.length || 0) > 0) {
            source = "tikhub";
            usedKeyword = kw;
            console.log(`[Recrawl] TikHub success with "${kw}": ${socialData.sampleNotes.length} notes`);
            break;
          } else {
            socialData = null;
            console.log(`[Recrawl] TikHub no data for "${kw}", trying next...`);
          }
        } catch (e) {
          console.error(`[Recrawl] TikHub error for "${kw}":`, e);
        }
      }
    }

    // Strategy 3: raw_market_signals fallback (try each keyword)
    if (!socialData) {
      console.log("[Recrawl] Trying raw_market_signals fallback...");
      for (const kw of uniqueKeywords) {
        const fallbackData = await crawlFromSignals(supabase, kw);
        if (fallbackData && (fallbackData.sampleNotes?.length || 0) > 0) {
          socialData = fallbackData;
          source = "raw_signals";
          usedKeyword = kw;
          console.log(`[Recrawl] Signals fallback success with "${kw}": ${fallbackData.totalNotes} items`);
          break;
        }
      }
    }

    if (!socialData || (socialData.sampleNotes?.length || 0) === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "no_social_data",
        message: "未能获取社交平台数据。请确认：1) 自爬虫服务正在运行，或 2) 已在设置中配置 TikHub Token。",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the report's xiaohongshu_data
    const existingXhsData = report.xiaohongshu_data || {};
    const mergedXhsData = {
      ...existingXhsData,
      ...socialData,
      _recrawledAt: new Date().toISOString(),
      _recrawlSource: source,
    };

    // Update data_summary with social info
    const existingSummary = report.data_summary || {};
    const updatedSummary = {
      ...existingSummary,
      fallbackUsed: source !== "self_crawler",
      fallbackReason: source === "self_crawler" ? null : `recrawl_${source}`,
      socialSummaries: socialData.sampleNotes?.slice(0, 5).map((n: any) => n.desc || n.title || "").filter(Boolean) || [],
    };

    // Update report
    const { error: updateError } = await supabase
      .from("validation_reports")
      .update({
        xiaohongshu_data: mergedXhsData,
        data_summary: updatedSummary,
      })
      .eq("id", report.id);

    if (updateError) {
      console.error("[Recrawl] Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update report" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Recrawl] Report updated. Source: ${source}, Notes: ${socialData.totalNotes}, Comments: ${socialData.sampleComments?.length || 0}`);

    return new Response(JSON.stringify({
      success: true,
      source,
      stats: {
        totalNotes: socialData.totalNotes,
        sampleNotesCount: socialData.sampleNotes?.length || 0,
        sampleCommentsCount: socialData.sampleComments?.length || 0,
        totalEngagement: socialData.totalEngagement || 0,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Recrawl] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
