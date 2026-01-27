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
