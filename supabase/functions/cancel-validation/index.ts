import { writeRunReport } from '../_shared/validation-run.ts';
/**
 * Cancel Validation Edge Function
 * 
 * Aborts a running validation and generates a degraded report
 * from whatever checkpoint data has already been collected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";
import { buildIncompleteAnalysis, buildValidationEvidence } from "../_shared/validation-evidence.ts";
import {
  calculateEvidenceGrade,
  estimateCostBreakdown,
  createDefaultProofResult,
} from "../_shared/report-metrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validationId = String(body.validationId || "").trim();
    if (!validationId) {
      return new Response(JSON.stringify({ error: "validationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { user } = await resolveAuthUserOrBypass(supabase, req);

    // Verify ownership
    const { data: validation, error: valError } = await supabase
      .from("validations")
      .select("*")
      .eq("id", validationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (valError || !validation) {
      return new Response(JSON.stringify({ error: "验证记录不存在或无权限" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only cancel if still processing
    if (validation.status !== "processing") {
      return new Response(JSON.stringify({ error: `当前状态为 ${validation.status}，无法取消` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load checkpoint data
    const { data: existingReport } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("validation_id", validationId)
      .maybeSingle();

    const socialData = (existingReport?.xiaohongshu_data && typeof existingReport.xiaohongshu_data === "object")
      ? existingReport.xiaohongshu_data as Record<string, unknown>
      : { totalNotes: 0, avgLikes: 0, avgComments: 0, avgCollects: 0, sampleNotes: [], sampleComments: [] };
    const competitorData = Array.isArray(existingReport?.competitor_data) ? existingReport.competitor_data : [];
    const dataSummary = (existingReport?.data_summary && typeof existingReport.data_summary === "object")
      ? existingReport.data_summary as Record<string, unknown>
      : {};

    const sampleNotes = Array.isArray((socialData as any).sampleNotes) ? (socialData as any).sampleNotes : [];
    const sampleComments = Array.isArray((socialData as any).sampleComments) ? (socialData as any).sampleComments : [];
    const noteCount = sampleNotes.length;
    const commentCount = sampleComments.length;
    const competitorCount = competitorData.length;

    // 取消只保留采集产物，不通过样本数量生成需求分数、情感或用户画像。
    const validationEvidence = buildValidationEvidence(socialData, competitorData, (dataSummary as any).carriedEvidence || []);
    const aiResult = buildIncompleteAnalysis(`验证已取消。已保留 ${noteCount} 条帖子和 ${commentCount} 条评论；分析未完成，可继续研究。`);
    const overallScore = aiResult.overallScore;

    // Calculate metrics
    const dataQualityScore = Math.min(100, Math.round(
      (noteCount >= 8 ? 16 : noteCount >= 4 ? 10 : noteCount * 2) +
      (commentCount >= 16 ? 16 : commentCount >= 8 ? 10 : commentCount) +
      (competitorCount >= 8 ? 16 : competitorCount >= 3 ? 10 : competitorCount * 3)
    ));
    const evidenceGrade = calculateEvidenceGrade({
      dataQualityScore,
      sampleCount: noteCount,
      commentCount,
      competitorCount,
    });
    const costBreakdown = estimateCostBreakdown({
      llmCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      externalApiCalls: 0,
      model: "cancelled",
      latencyMs: 0,
    });
    (costBreakdown as any).cancelled = true;
    const proofResult = createDefaultProofResult();

    // Save/update report
    const reportData = {
      validation_id: validationId,
      market_analysis: aiResult.marketAnalysis,
      xiaohongshu_data: { ...socialData, totalNotes: noteCount },
      competitor_data: competitorData,
      sentiment_analysis: aiResult.sentimentAnalysis,
      ai_analysis: aiResult.aiAnalysis,
      dimensions: aiResult.dimensions,
      persona: aiResult.persona,
      data_summary: {
        ...dataSummary,
        analysisStatus: 'incomplete',
        validationEvidence,
        sampleCounts: { posts: noteCount, comments: commentCount, independentSources: new Set(validationEvidence.filter(item => !item.sourceKey.includes(':unattributed:')).map(item => item.sourceKey)).size },
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      },
      data_quality_score: dataQualityScore,
      keywords_used: existingReport?.keywords_used || { coreKeywords: [] },
      evidence_grade: evidenceGrade,
      cost_breakdown: costBreakdown,
      proof_result: proofResult,
    };

    await writeRunReport(supabase, validationId, user.id, validation.active_run_id || null, reportData, true, overallScore);

    return new Response(JSON.stringify({
      success: true,
      validationId,
      overallScore,
      analysisStatus: 'incomplete',
      cancelled: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cancel validation error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "取消失败",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
