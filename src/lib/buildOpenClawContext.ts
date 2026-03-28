import type { ReportDataResult } from "@/components/report/useReportData";

/**
 * Serialize full report data into a structured Markdown document
 * to be sent as context to the OpenClaw AI Agent.
 */
export function buildOpenClawContext(r: ReportDataResult): string {
  const lines: string[] = [];
  const { validation, aiAnalysis, dimensions, personaData, marketAnalysis, sentimentAnalysis, competitorRows, xiaohongshuData, evidenceGrade, proofResult } = r;

  lines.push(`# 验证报告摘要`);
  lines.push("");
  lines.push(`## 创意: ${validation.idea}`);
  lines.push(`综合得分: ${validation.overall_score ?? "N/A"}/100 | 证据等级: ${evidenceGrade} | 商业可用性: ${proofResult.verdict}`);
  if (validation.tags?.length) {
    lines.push(`标签: ${validation.tags.map(t => `#${t}`).join(" ")}`);
  }

  lines.push("");
  lines.push(`## AI 综合判断`);
  lines.push(aiAnalysis.overallVerdict);

  if (dimensions.length) {
    lines.push("");
    lines.push(`## 维度评分`);
    for (const d of dimensions) {
      lines.push(`- ${d.dimension}: ${d.score}/100 — ${d.reason}`);
    }
  }

  if (personaData) {
    lines.push("");
    lines.push(`## 用户画像`);
    lines.push(`姓名: ${personaData.name} | 角色: ${personaData.role} | 年龄: ${personaData.age} | 收入: ${personaData.income}`);
    lines.push(`技术熟悉度: ${personaData.techSavviness}/100 | 消费能力: ${personaData.spendingCapacity}/100`);
    if (personaData.painPoints.length) lines.push(`痛点: ${personaData.painPoints.join("；")}`);
    if (personaData.goals.length) lines.push(`目标: ${personaData.goals.join("；")}`);
    if (personaData.description) lines.push(`描述: ${personaData.description}`);
  }

  lines.push("");
  lines.push(`## 市场分析`);
  lines.push(`目标受众: ${marketAnalysis.targetAudience}`);
  lines.push(`市场规模: ${marketAnalysis.marketSize}`);
  lines.push(`竞争程度: ${marketAnalysis.competitionLevel}`);
  lines.push(`趋势方向: ${marketAnalysis.trendDirection}`);
  if (marketAnalysis.keywords.length) lines.push(`关键词: ${marketAnalysis.keywords.join(", ")}`);

  lines.push("");
  lines.push(`## 情感分析`);
  lines.push(`正面 ${sentimentAnalysis.positive}% | 中性 ${sentimentAnalysis.neutral}% | 负面 ${sentimentAnalysis.negative}%`);
  if (sentimentAnalysis.topPositive.length) lines.push(`正面关键词: ${sentimentAnalysis.topPositive.join(", ")}`);
  if (sentimentAnalysis.topNegative.length) lines.push(`负面关键词: ${sentimentAnalysis.topNegative.join(", ")}`);

  if (aiAnalysis.strengths.length || aiAnalysis.weaknesses.length) {
    lines.push("");
    lines.push(`## 优势与劣势`);
    if (aiAnalysis.strengths.length) lines.push(`优势: ${aiAnalysis.strengths.join("；")}`);
    if (aiAnalysis.weaknesses.length) lines.push(`劣势: ${aiAnalysis.weaknesses.join("；")}`);
    if (aiAnalysis.risks.length) lines.push(`风险: ${aiAnalysis.risks.join("；")}`);
    if (aiAnalysis.suggestions.length) lines.push(`建议: ${aiAnalysis.suggestions.join("；")}`);
  }

  if (aiAnalysis.monetizationStrategies.length) {
    lines.push("");
    lines.push(`## 盈利策略建议`);
    for (const s of aiAnalysis.monetizationStrategies) {
      if (typeof s === "string") { lines.push(`- ${s}`); }
      else if (s && typeof s === "object") {
        const obj = s as Record<string, unknown>;
        lines.push(`- ${obj.name || obj.title || JSON.stringify(s)}: ${obj.description || ""}`);
      }
    }
  }

  if (aiAnalysis.brandNames.length) {
    lines.push("");
    lines.push(`## 品牌名建议`);
    for (const b of aiAnalysis.brandNames) {
      if (typeof b === "string") { lines.push(`- ${b}`); }
      else if (b && typeof b === "object") {
        const obj = b as Record<string, unknown>;
        lines.push(`- ${obj.name || ""}: ${obj.reason || obj.description || ""}`);
      }
    }
  }

  const sampleNotes = xiaohongshuData.sampleNotes.slice(0, 6);
  const sampleComments = xiaohongshuData.sampleComments.slice(0, 6);
  if (sampleNotes.length || sampleComments.length) {
    lines.push("");
    lines.push(`## 真实用户声音（样本数据）`);
    lines.push(`小红书数据: ${xiaohongshuData.totalNotes} 条笔记 | 平均 ${xiaohongshuData.avgLikes} 赞 / ${xiaohongshuData.avgComments} 评论 / ${xiaohongshuData.avgCollects} 收藏`);
    if (sampleNotes.length) {
      lines.push("");
      lines.push(`### 样本笔记`);
      for (const n of sampleNotes) {
        const title = (n as any)?.title || "无标题";
        const desc = (n as any)?.desc || "";
        lines.push(`- 「${title}」${desc ? ` — ${desc.slice(0, 120)}` : ""}`);
      }
    }
    if (sampleComments.length) {
      lines.push("");
      lines.push(`### 用户评论`);
      for (const c of sampleComments) {
        const nick = (c as any)?.user_nickname || "匿名";
        const content = (c as any)?.content || "";
        lines.push(`- ${nick}: ${content.slice(0, 150)}`);
      }
    }
  }

  if (competitorRows.length) {
    lines.push("");
    lines.push(`## 竞品信息`);
    for (const c of competitorRows.slice(0, 6)) {
      const title = (c as any)?.title || "竞品";
      const snippet = (c as any)?.snippet || "";
      lines.push(`- ${title}: ${snippet.slice(0, 120)}`);
    }
  }

  const dataSummary = (r.report?.data_summary ?? null) as unknown as Record<string, unknown> | null;
  if (dataSummary) {
    lines.push("");
    lines.push(`## 数据摘要`);
    if (Array.isArray(dataSummary.painClusters) && dataSummary.painClusters.length) {
      lines.push(`痛点聚类: ${(dataSummary.painClusters as string[]).join("；")}`);
    }
    if (Array.isArray(dataSummary.marketSignals) && dataSummary.marketSignals.length) {
      lines.push(`市场信号: ${(dataSummary.marketSignals as string[]).join("；")}`);
    }
    if (dataSummary.crossPlatformResonance) {
      lines.push(`跨平台共振: ${JSON.stringify(dataSummary.crossPlatformResonance)}`);
    }
  }

  return lines.join("\n");
}

export type OpenClawTaskType = "xiaohongshu_publish" | "marketing_image" | "competitor_research" | "brainstorm" | "xiaohongshu" | "content_pipeline" | "prd" | "competitive_analysis" | "growth_strategy" | "gtm_plan" | "tech_architecture";

/**
 * Build a condensed summary (~500 words) of the report for follow-up messages.
 * Avoids sending 3000+ words of context every time.
 */
export function buildOpenClawContextSummary(r: ReportDataResult): string {
  const lines: string[] = [];
  const { validation, aiAnalysis, dimensions, personaData, marketAnalysis, sentimentAnalysis, competitorRows, evidenceGrade, proofResult } = r;

  lines.push(`# 验证报告摘要（精简版）`);
  lines.push(`创意: ${validation.idea}`);
  lines.push(`综合得分: ${validation.overall_score ?? "N/A"}/100 | 证据等级: ${evidenceGrade} | 商业可用性: ${proofResult.verdict}`);

  if (dimensions.length) {
    const topDims = dimensions.slice(0, 4);
    lines.push(`维度: ${topDims.map(d => `${d.dimension}(${d.score})`).join(' | ')}`);
  }

  if (personaData) {
    lines.push(`用户画像: ${personaData.name}, ${personaData.role}, ${personaData.age}岁`);
    if (personaData.painPoints.length) lines.push(`核心痛点: ${personaData.painPoints.slice(0, 3).join('；')}`);
  }

  lines.push(`市场: ${marketAnalysis.targetAudience} | 规模${marketAnalysis.marketSize} | 竞争${marketAnalysis.competitionLevel} | 趋势${marketAnalysis.trendDirection}`);
  lines.push(`情感: 正面${sentimentAnalysis.positive}% 中性${sentimentAnalysis.neutral}% 负面${sentimentAnalysis.negative}%`);

  if (aiAnalysis.strengths.length) lines.push(`优势: ${aiAnalysis.strengths.slice(0, 3).join('；')}`);
  if (aiAnalysis.weaknesses.length) lines.push(`劣势: ${aiAnalysis.weaknesses.slice(0, 3).join('；')}`);

  if (competitorRows.length) {
    const names = competitorRows.slice(0, 4).map((c: any) => c.title || '竞品').join('、');
    lines.push(`主要竞品: ${names}`);
  }

  return lines.join('\n');
}

/**
 * Build the initial prompt message that wraps the context.
 * Now delegates to openclawSkills for task-specific instructions.
 */
export function buildOpenClawPrompt(context: string, task: OpenClawTaskType = "xiaohongshu"): string {
  // For skills managed by openclawSkills.ts, use their quickStart
  try {
    const { getSkillByTaskType } = require('./openclawSkills');
    const skill = getSkillByTaskType(task);
    if (skill) {
      return `以下是我的创业想法的完整验证报告数据：\n\n${context}\n\n---\n\n${skill.quickStart}`;
    }
  } catch { /* fallback below */ }

  // Fallback for non-skill tasks
  const fallbackInstructions: Partial<Record<OpenClawTaskType, string>> = {
    xiaohongshu: `请基于以上验证报告数据，帮我撰写一篇适合在小红书发布的种草/测评文案。`,
    xiaohongshu_publish: `请基于以上验证报告数据，完成完整的小红书发布流程。`,
    marketing_image: `请基于以上验证报告数据，为我的产品生成营销素材。`,
    competitor_research: `请基于以上验证报告数据，进行深度竞品调研。`,
    brainstorm: `请基于以上验证报告数据，进行创意头脑风暴。`,
    content_pipeline: `请基于以上内容信息，完成多平台内容生产流水线。`,
  };

  const instruction = fallbackInstructions[task] || '请基于以上数据进行分析。';
  return `以下是我的创业想法的完整验证报告数据：\n\n${context}\n\n---\n\n${instruction}`;
}
