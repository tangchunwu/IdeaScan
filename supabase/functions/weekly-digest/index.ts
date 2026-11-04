import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isDecisionReady } from "../_shared/analysis-status.ts";

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
      const { data: reports } = await supabase.from('validation_reports').select('validation_id, ai_analysis, data_summary').in('validation_id', validations.map((item: any) => item.id));
      const reportMap = new Map((reports || []).map((item: any) => [item.validation_id, item]));
      const readyValidations = validations.filter((item: any) => isDecisionReady(reportMap.get(item.id)?.ai_analysis, reportMap.get(item.id)?.data_summary) && typeof item.overall_score === 'number');
      if (!readyValidations.length) continue;

      const scores = readyValidations.map((v: any) => v.overall_score as number);
      const avgScore = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);

      summaries.push({
        userId,
        count: readyValidations.length,
        avgScore,
        bestIdea: readyValidations[0]?.idea?.slice(0, 50),
        bestScore: readyValidations[0]?.overall_score,
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
