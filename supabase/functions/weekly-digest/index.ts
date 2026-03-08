import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    // Get users who opted in (or all users if no preference set)
    const { data: users } = await supabase
      .from("validations")
      .select("user_id")
      .gte("created_at", weekStart.toISOString())
      .eq("status", "completed");

    const uniqueUsers = [...new Set((users || []).map((u: any) => u.user_id))];
    const summaries = [];

    for (const userId of uniqueUsers) {
      // Check if user opted out
      const { data: pref } = await supabase
        .from("weekly_digest_preferences")
        .select("enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (pref && !pref.enabled) continue;

      const { data: validations } = await supabase
        .from("validations")
        .select("id, idea, overall_score, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", weekStart.toISOString())
        .order("overall_score", { ascending: false });

      if (!validations || validations.length === 0) continue;

      const scores = validations.map((v: any) => v.overall_score || 0);
      const avgScore = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);

      summaries.push({
        userId,
        count: validations.length,
        avgScore,
        bestIdea: validations[0]?.idea?.slice(0, 50),
        bestScore: validations[0]?.overall_score,
      });

      // Update last_sent_at
      await supabase
        .from("weekly_digest_preferences")
        .upsert({ user_id: userId, last_sent_at: now.toISOString() }, { onConflict: "user_id" });
    }

    return new Response(
      JSON.stringify({ success: true, processed: summaries.length, summaries }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Weekly digest error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
