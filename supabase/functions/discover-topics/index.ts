import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrendingTopicInput {
  keyword: string;
  category?: string;
  heat_score: number;
  growth_rate?: number;
  sample_count: number;
  avg_engagement: number;
  sentiment_positive: number;
  sentiment_negative: number;
  sentiment_neutral: number;
  top_pain_points: string[];
  related_keywords: string[];
  sources: { platform: string; count: number }[];
}

function safeText(input: unknown, max = 32): string {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.slice(0, max);
}

function keywordFromValidation(idea: string, tags: string[]): string {
  const firstTag = safeText(tags?.[0], 32);
  if (firstTag) return firstTag;
  const cleaned = safeText(idea.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ""), 32);
  return cleaned || safeText(idea, 32);
}

function numberOrZero(input: unknown): number {
  const value = Number(input || 0);
  return Number.isFinite(value) ? value : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "未授权" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "用户验证失败" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, topics } = await req.json();

    if (action === "scan") {
      // This would trigger a background scan for trending topics
      // For now, return the current topics
      const { data: existingTopics, error } = await supabase
        .from("trending_topics")
        .select("*")
        .eq("is_active", true)
        .order("heat_score", { ascending: false })
        .limit(50);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, topics: existingTopics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "add" && Array.isArray(topics)) {
      // Add new trending topics (typically from validation results)
      const topicsToInsert = topics.map((t: TrendingTopicInput) => ({
        keyword: t.keyword,
        category: t.category || null,
        heat_score: t.heat_score,
        growth_rate: t.growth_rate || null,
        sample_count: t.sample_count,
        avg_engagement: t.avg_engagement,
        sentiment_positive: t.sentiment_positive,
        sentiment_negative: t.sentiment_negative,
        sentiment_neutral: t.sentiment_neutral,
        top_pain_points: t.top_pain_points || [],
        related_keywords: t.related_keywords || [],
        sources: t.sources || [],
        created_by: user.id,
      }));

      const { data: insertedTopics, error } = await supabase
        .from("trending_topics")
        .insert(topicsToInsert)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, topics: insertedTopics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "refresh") {
      // Deactivate expired topics
      const { error: deactivateError } = await supabase
        .from("trending_topics")
        .update({ is_active: false })
        .lt("expires_at", new Date().toISOString());

      if (deactivateError) {
        console.error("Error deactivating expired topics:", deactivateError);
      }

      // Get fresh active topics
      const { data: freshTopics, error } = await supabase
        .from("trending_topics")
        .select("*")
        .eq("is_active", true)
        .order("heat_score", { ascending: false })
        .limit(50);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, topics: freshTopics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "backfill_from_validations") {
      const { data: validations, error: validationsError } = await supabase
        .from("validations")
        .select("id, idea, tags, overall_score, status, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(80);

      if (validationsError) throw validationsError;
      if (!validations || validations.length === 0) {
        return new Response(
          JSON.stringify({ success: true, topics: [], upserted: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validationIds = validations.map(v => v.id);
      const { data: reports, error: reportsError } = await supabase
        .from("validation_reports")
        .select("validation_id, xiaohongshu_data, sentiment_analysis, data_quality_score")
        .in("validation_id", validationIds);

      if (reportsError) throw reportsError;
      const reportMap = new Map((reports || []).map(r => [r.validation_id, r]));

      const rows = validations.map((v: any) => {
        const tags = Array.isArray(v.tags) ? v.tags : [];
        const report: any = reportMap.get(v.id) || {};
        const xhs = (report.xiaohongshu_data && typeof report.xiaohongshu_data === "object") ? report.xiaohongshu_data : {};
        const sampleNotes = Array.isArray(xhs.sampleNotes) ? xhs.sampleNotes : [];
        const sampleComments = Array.isArray(xhs.sampleComments) ? xhs.sampleComments : [];
        const sampleCount = Math.max(1, sampleNotes.length + sampleComments.length);
        const avgLikes = numberOrZero(xhs.avgLikes || xhs.avg_likes);
        const avgComments = numberOrZero(xhs.avgComments || xhs.avg_comments);
        const avgEngagement = Math.round((avgLikes + avgComments * 2));
        const heatScore = Math.max(1, Math.min(100, Math.round(sampleCount * 2 + avgEngagement / 20)));
        const validationScore = Math.max(0, Math.min(100, Math.round(numberOrZero(v.overall_score))));
        const qualityScore = Math.max(1, Math.min(100, Math.round(
          heatScore * 0.45 +
          validationScore * 0.4 +
          Math.min(15, sampleCount) * 0.15
        )));
        const sentiment: any = (report.sentiment_analysis && typeof report.sentiment_analysis === "object") ? report.sentiment_analysis : {};
        const keyword = keywordFromValidation(String(v.idea || ""), tags);

        return {
          keyword,
          category: tags[1] || tags[0] || null,
          heat_score: heatScore,
          sample_count: sampleCount,
          avg_engagement: avgEngagement,
          sentiment_positive: numberOrZero(sentiment.positive) || 33,
          sentiment_negative: numberOrZero(sentiment.negative) || 33,
          sentiment_neutral: numberOrZero(sentiment.neutral) || 34,
          related_keywords: tags.slice(0, 8),
          sources: [{ platform: "validation_backfill", count: sampleCount }],
          validation_count: 1,
          avg_validation_score: validationScore,
          confidence_level: "medium",
          quality_score: qualityScore,
          source_type: "user_validation",
          is_active: true,
          created_by: user.id,
          last_crawled_at: v.updated_at || v.created_at,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        };
      }).filter((row) => row.keyword.length > 0);

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("trending_topics")
          .upsert(rows, { onConflict: "keyword" });
        if (upsertError) throw upsertError;
      }

      const { data: freshTopics, error: fetchError } = await supabase
        .from("trending_topics")
        .select("*")
        .eq("is_active", true)
        .order("quality_score", { ascending: false })
        .limit(50);
      if (fetchError) throw fetchError;

      return new Response(
        JSON.stringify({ success: true, topics: freshTopics || [], upserted: rows.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "无效操作" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in discover-topics:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
