import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const mode = url.searchParams.get("mode"); // "og" for OG HTML page

    if (!token || token.length < 8) {
      return new Response(JSON.stringify({ error: "Invalid share token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find validation by share_token
    const { data: validation, error: vErr } = await supabase
      .from("validations")
      .select("id, idea, overall_score, tags, status, created_at")
      .eq("share_token", token)
      .maybeSingle();

    if (vErr || !validation) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get report
    const { data: report } = await supabase
      .from("validation_reports")
      .select("ai_analysis, dimensions, market_analysis, xiaohongshu_data, sentiment_analysis, competitor_data, persona, evidence_grade, proof_result, data_quality_score, keywords_used, cost_breakdown")
      .eq("validation_id", validation.id)
      .maybeSingle();

    // OG mode: return HTML with meta tags for social crawlers
    if (mode === "og") {
      const score = validation.overall_score || 0;
      const idea = escapeHtml(validation.idea || "");
      const ai = (report?.ai_analysis || {}) as Record<string, unknown>;
      const verdict = escapeHtml(String(ai.overallVerdict || "AI 验证报告"));
      const tags = Array.isArray(validation.tags) ? validation.tags.slice(0, 3).map((t: string) => `#${t}`).join(" ") : "";
      const appUrl = "https://ideascan.lovable.app";
      const shareUrl = `${appUrl}/share/${token}`;

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${idea} - 验证得分 ${score} | IdeaScan</title>
  <meta name="description" content="${verdict} ${tags}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:title" content="${idea} - 验证得分 ${score}/100">
  <meta property="og:description" content="${verdict}">
  <meta property="og:image" content="${appUrl}/og-image.png">
  <meta property="og:site_name" content="IdeaScan">
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${idea} - 验证得分 ${score}/100">
  <meta name="twitter:description" content="${verdict}">
  <meta name="twitter:image" content="${appUrl}/og-image.png">
  <meta http-equiv="refresh" content="0;url=${shareUrl}">
</head>
<body>
  <p>正在跳转到报告页面...</p>
  <a href="${shareUrl}">点击此处查看报告</a>
</body>
</html>`;

      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // JSON mode: return report data
    return new Response(
      JSON.stringify({ validation, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[get-shared-report] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
