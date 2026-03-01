/**
 * Re-crawl social media data for an existing validation.
 * Strategy: TikHub-only (Xiaohongshu / Douyin)
 * Then updates the validation_report with the new social data.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    llmBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
    llmFallbacks?: Array<{ baseUrl: string; apiKey: string; model: string }>;
  };
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 0,
  timeoutMs = 45000,
): Promise<{ status: number; data: any } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      console.log(`[TikHub] Attempt ${attempt + 1}: status=${resp.status} for ${url.slice(0, 120)}`);

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await resp.text();
        console.error(`[TikHub] Non-JSON response (${contentType}): ${text.slice(0, 200)}`);
        if (attempt < maxRetries) {
          const delay = 2000 * (attempt + 1);
          console.log(`[TikHub] Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      if (resp.status === 504 || resp.status === 502 || resp.status === 503) {
        await resp.text();
        if (attempt < maxRetries) {
          const delay = 2000 * (attempt + 1);
          console.log(`[TikHub] Server error ${resp.status}, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      const data = await resp.json();
      return { status: resp.status, data };
    } catch (e) {
      const timeoutLike = String((e as Error)?.name || "").includes("Timeout") || String(e).toLowerCase().includes("timeout") || String(e).toLowerCase().includes("aborted");
      console.error(`[TikHub] Attempt ${attempt + 1} ${timeoutLike ? "timeout" : "error"}:`, e);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

const KEYWORD_NOISE_TERMS = ["做一个", "做一款", "做个", "我想做", "我要做", "面向", "针对", "用于", "帮助", "给", "平台", "系统", "工具", "项目", "应用", "软件"] as const;

function normalizeKeyword(input: string): string {
  return String(input || "")
    .replace(/[：:，,。！？!?；;"'`]+/g, " ")
    .replace(/[【】\[\]（）()<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function buildKeywordVariants(input: string): string[] {
  const normalized = normalizeKeyword(input);
  if (!normalized) return [];

  let deNoised = normalized;
  for (const term of KEYWORD_NOISE_TERMS) {
    deNoised = deNoised.split(term).join(" ");
  }
  deNoised = deNoised.replace(/\s+/g, " ").trim() || normalized;

  const variants: string[] = [];
  const push = (v: string) => {
    const s = normalizeKeyword(v);
    if (!s || s.length < 2) return;
    variants.push(s);
  };

  push(deNoised);
  const zhChunks = deNoised.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const chunk of zhChunks.slice(0, 8)) {
    if (chunk.length <= 10) {
      push(chunk);
    } else {
      push(chunk.slice(0, 10));
      push(chunk.slice(-10));
      push(chunk.slice(2, 12));
    }
  }

  const enTokens = deNoised.match(/[A-Za-z][A-Za-z0-9+.-]{1,20}/g) || [];
  for (const token of enTokens.slice(0, 6)) push(token);

  const seen = new Set<string>();
  return variants.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function crawlViaTikhub(keyword: string, token: string, enableXhs: boolean, enableDy: boolean) {
  const TIKHUB_BASE = "https://api.tikhub.io";
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  
  const sampleNotes: any[] = [];
  const sampleComments: any[] = [];
  let totalEngagement = 0;

  // Xiaohongshu
  if (enableXhs) {
    const keywordVariants = buildKeywordVariants(keyword).slice(0, 6);
    console.log(`[TikHub-XHS] Keyword variants: ${JSON.stringify(keywordVariants)}`);

    for (const kw of keywordVariants) {
      try {
        const url = `${TIKHUB_BASE}/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(kw)}&page=1&sort=general&note_type=0`;
        console.log(`[TikHub-XHS] Requesting: ${url}`);
        const result = await fetchWithRetry(url, headers, 1, 45000);
        if (!result?.data) {
          console.error(`[TikHub-XHS] All retries failed for keyword: ${kw}`);
          continue;
        }

        const data = result.data;
        const payload = data?.data?.data || data?.data || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        const notes = items.map((item: any) => item?.note || item);
        console.log(`[TikHub-XHS] Keyword "${kw}" found ${notes.length} notes`);

        if (notes.length === 0) continue;

        for (const note of notes.slice(0, 14)) {
          const noteId = String(note.id || note.note_id || "");
          sampleNotes.push({
            note_id: noteId,
            title: "[小红书] " + String(note.title || "").slice(0, 60),
            desc: String(note.desc || "").slice(0, 280),
            liked_count: Number(note.liked_count || 0),
            collected_count: Number(note.collected_count || 0),
            comments_count: Number(note.comments_count || note.comment_count || 0),
            user_nickname: note.user?.nickname || "",
            _platform: "xiaohongshu",
          });
          totalEngagement += Number(note.liked_count || 0) + Number(note.comments_count || note.comment_count || 0);

          if (!noteId || sampleComments.length >= 60) continue;
          const commentsResult = await fetchWithRetry(
            `${TIKHUB_BASE}/api/v1/xiaohongshu/web/get_note_comments?note_id=${encodeURIComponent(noteId)}`,
            headers,
            1,
            45000,
          );
          const commentPayload = commentsResult?.data?.data?.data || commentsResult?.data?.data || {};
          const comments = Array.isArray(commentPayload.comments) ? commentPayload.comments : [];
          for (const c of comments.slice(0, 6)) {
            sampleComments.push({
              comment_id: c.id || "",
              content: c.content || "",
              like_count: Number(c.like_count || 0),
              user_nickname: c.user?.nickname || "",
              ip_location: c.ip_location || "",
              _platform: "xiaohongshu",
            });
          }
        }

        if (sampleNotes.length > 0) break;
      } catch (e) {
        console.error(`[TikHub-XHS] Error for keyword "${kw}":`, e);
      }
    }
  }

  // Douyin
  if (enableDy) {
    try {
      const url = `${TIKHUB_BASE}/api/v1/douyin/web/fetch_video_search_result?keyword=${encodeURIComponent(keyword)}&offset=0&count=10&sort_type=0`;
      console.log(`[TikHub-DY] Requesting: ${url.slice(0, 120)}`);
      const result = await fetchWithRetry(url, headers, 1);
      if (result?.data) {
        const data = result.data;
        const payload = data?.data?.data || data?.data || {};
        const awemeList = Array.isArray(payload.aweme_list) ? payload.aweme_list : [];
        const videos = awemeList.map((item: any) => item?.aweme_info || item);
        for (const aweme of videos.slice(0, 10)) {
          const awemeId = String(aweme.aweme_id || "");
          if (!awemeId) continue;
          sampleNotes.push({
            note_id: awemeId,
            title: "[抖音] " + String(aweme.desc || "").slice(0, 60),
            desc: String(aweme.desc || "").slice(0, 280),
            liked_count: Number(aweme.statistics?.digg_count || 0),
            comments_count: Number(aweme.statistics?.comment_count || 0),
            collected_count: Number(aweme.statistics?.collect_count || 0),
            shared_count: Number(aweme.statistics?.share_count || 0),
            user_nickname: aweme.author?.nickname || "",
            _platform: "douyin",
          });
          totalEngagement += Number(aweme.statistics?.digg_count || 0) + Number(aweme.statistics?.comment_count || 0);

          if (sampleComments.length >= 90) continue;
          const commentsResult = await fetchWithRetry(
            `${TIKHUB_BASE}/api/v1/douyin/web/fetch_video_comments?aweme_id=${encodeURIComponent(awemeId)}&cursor=0&count=8`,
            headers,
            1,
          );
          const commentPayload = commentsResult?.data?.data?.data || commentsResult?.data?.data || {};
          const comments = Array.isArray(commentPayload.comments) ? commentPayload.comments : [];
          for (const c of comments.slice(0, 6)) {
            sampleComments.push({
              comment_id: c.cid || "",
              content: c.text || "",
              like_count: Number(c.digg_count || 0),
              user_nickname: c.user?.nickname || "",
              ip_location: c.ip_label || "",
              _platform: "douyin",
            });
          }
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

    const keywordCandidates = [
      ...tags.flatMap((t: string) => buildKeywordVariants(t)),
      ...buildKeywordVariants(idea),
      normalizeKeyword(idea.split(/[。！？!?；;\n]/)[0] || idea),
    ].filter(Boolean);

    // Deduplicate + keep more candidates to avoid single bad keyword causing 400/0 data
    const uniqueKeywords = Array.from(new Set(keywordCandidates)).slice(0, 6);

    const enableXhs = config?.enableXiaohongshu !== false;
    const enableDy = false;
    const tikhubToken = config?.tikhubToken || "";

    console.log(`[Recrawl] Starting for ${validationId}, keywords: ${JSON.stringify(uniqueKeywords)}, maxKeywords=${uniqueKeywords.length}`);
    console.log(`[Recrawl] Config: tikhub=${!!tikhubToken}, xhs=${enableXhs}, dy=${enableDy}`);

    if (!tikhubToken) {
      return new Response(JSON.stringify({
        success: false,
        error: "tikhub_token_required",
        message: "请先在设置中配置 TikHub Token 再补充社交数据。",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let socialData: any = null;
    let source = "none";

    for (const kw of uniqueKeywords) {
      console.log(`[Recrawl] Attempting TikHub with keyword: "${kw}"`);
      try {
        socialData = await crawlViaTikhub(kw, tikhubToken, enableXhs, enableDy);
        if ((socialData?.sampleNotes?.length || 0) > 0) {
          source = "tikhub";
          console.log(`[Recrawl] TikHub success with "${kw}": ${socialData.sampleNotes.length} notes`);
          break;
        }
        socialData = null;
        console.log(`[Recrawl] TikHub no data for "${kw}", trying next...`);
      } catch (e) {
        console.error(`[Recrawl] TikHub error for "${kw}":`, e);
      }
    }

    if (!socialData || (socialData.sampleNotes?.length || 0) === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "no_social_data",
        message: "未能从 TikHub 获取小红书数据，请检查 Token 或更换关键词后重试。",
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
      fallbackUsed: false,
      fallbackReason: null,
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
