/**
 * Cancel Validation Edge Function
 * 
 * Aborts a running validation and generates a degraded report
 * from whatever checkpoint data has already been collected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";
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
    const avgLikes = Number((socialData as any).avgLikes || 0);
    const competitorCount = competitorData.length;

    // Build degraded analysis
    const evidenceScore = Math.min(100, Math.round(
      Math.min(45, noteCount * 1.2) +
      Math.min(30, commentCount * 2) +
      Math.min(25, competitorCount * 5)
    ));
    const competitionPenalty = competitorCount >= 5 ? 12 : competitorCount >= 3 ? 8 : competitorCount >= 1 ? 4 : 0;
    const overallScore = Math.max(30, Math.min(70, evidenceScore - competitionPenalty));

    const verdict = noteCount > 0 || commentCount > 0
      ? `用户主动取消验证。已采集 ${noteCount} 条笔记和 ${commentCount} 条评论，基于部分数据生成降级报告。建议后续补充验证。`
      : `用户主动取消验证。尚未采集到有效社媒数据，报告基于有限信息生成。建议重新发起完整验证。`;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    if (noteCount > 0) strengths.push(`已采集 ${noteCount} 条笔记，具备初步方向参考。`);
    if (commentCount > 0) strengths.push(`已采集 ${commentCount} 条评论，有部分用户声音。`);
    if (competitorCount > 0) strengths.push(`已获取 ${competitorCount} 条竞品信息。`);
    if (strengths.length === 0) strengths.push("数据采集被中断，暂无有效证据。");
    weaknesses.push("验证被提前终止，数据样本不完整。");
    weaknesses.push("AI 深度分析未执行，结论为规则化保底分析。");

    const tags = Array.isArray(validation.tags) ? validation.tags : [];
    const aggregatedInsights = {
      marketInsight: String((dataSummary as any).aggregatedInsights?.marketInsight || ""),
      competitiveInsight: String((dataSummary as any).aggregatedInsights?.competitiveInsight || ""),
      keyFindings: Array.isArray((dataSummary as any).aggregatedInsights?.keyFindings)
        ? (dataSummary as any).aggregatedInsights.keyFindings : [],
    };

    const aiResult = {
      overallScore,
      overallVerdict: verdict,
      marketAnalysis: {
        targetAudience: tags.length > 0 ? `目标人群：${tags.join(" / ")}` : "待确认",
        marketSize: noteCount >= 20 ? "有一定讨论量" : "讨论量有限",
        competitionLevel: competitorCount >= 5 ? "中高" : competitorCount >= 2 ? "中等" : "待确认",
      },
      sentimentAnalysis: { positive: 34, neutral: 45, negative: 21 },
      aiAnalysis: {
        feasibilityScore: overallScore,
        strengths,
        weaknesses,
        risks: ["验证被中断，结论不完整，存在误判风险。", "建议重新发起完整验证以获得可靠结论。"],
        suggestions: ["重新发起完整验证以获取更准确的分析结论。", "补充更多社媒样本数据来提高置信度。"],
      },
      persona: {
        name: "待补样本用户",
        role: "潜在目标用户",
        age: "待确认",
        painPoints: [aggregatedInsights.marketInsight || "需更多数据才能准确识别痛点"],
        goals: ["待完整验证后确认"],
      },
      dimensions: [
        { dimension: "需求痛感", score: Math.max(30, Math.min(65, 30 + commentCount * 2)), reason: `基于 ${commentCount} 条评论（不完整）` },
        { dimension: "市场规模", score: Math.max(30, Math.min(65, 25 + Math.round(noteCount * 0.8))), reason: `基于 ${noteCount} 条内容（不完整）` },
        { dimension: "竞争壁垒", score: Math.max(35, Math.min(65, 60 - competitorCount * 5)), reason: `基于 ${competitorCount} 个竞品（不完整）` },
        { dimension: "PMF潜力", score: Math.max(30, Math.min(65, 35 + commentCount + Math.round(avgLikes / 20))), reason: "数据不完整，仅供参考" },
      ],
    };

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
      xiaohongshu_data: socialData,
      competitor_data: competitorData,
      sentiment_analysis: aiResult.sentimentAnalysis,
      ai_analysis: aiResult.aiAnalysis,
      dimensions: aiResult.dimensions,
      persona: aiResult.persona,
      data_summary: {
        ...dataSummary,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      },
      data_quality_score: dataQualityScore,
      keywords_used: existingReport?.keywords_used || { coreKeywords: [] },
      evidence_grade: evidenceGrade,
      cost_breakdown: costBreakdown,
      proof_result: proofResult,
    };

    if (existingReport?.id) {
      await supabase.from("validation_reports").update(reportData).eq("validation_id", validationId);
    } else {
      await supabase.from("validation_reports").insert(reportData);
    }

    // Mark validation as completed (with partial data)
    await supabase
      .from("validations")
      .update({ status: "completed", overall_score: overallScore })
      .eq("id", validationId);

    return new Response(JSON.stringify({
      success: true,
      validationId,
      overallScore,
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
