import type { ReportDataResult } from "@/components/report/useReportData";

/**
 * Serialize full report data into a structured Markdown document
 * to be sent as context to the OpenClaw AI Agent.
 */
export function buildOpenClawContext(r: ReportDataResult): string {
  const lines: string[] = [];
  const { validation, aiAnalysis, dimensions, personaData, marketAnalysis, sentimentAnalysis, competitorRows, xiaohongshuData, evidenceGrade, proofResult } = r;

  // Header
  lines.push(`# 验证报告摘要`);
  lines.push("");
  lines.push(`## 创意: ${validation.idea}`);
  lines.push(`综合得分: ${validation.overall_score ?? "N/A"}/100 | 证据等级: ${evidenceGrade} | 商业可用性: ${proofResult.verdict}`);
  if (validation.tags?.length) {
    lines.push(`标签: ${validation.tags.map(t => `#${t}`).join(" ")}`);
  }

  // AI verdict
  lines.push("");
  lines.push(`## AI 综合判断`);
  lines.push(aiAnalysis.overallVerdict);

  // Dimensions
  if (dimensions.length) {
    lines.push("");
    lines.push(`## 维度评分`);
    for (const d of dimensions) {
      lines.push(`- ${d.dimension}: ${d.score}/100 — ${d.reason}`);
    }
  }

  // Persona
  if (personaData) {
    lines.push("");
    lines.push(`## 用户画像`);
    lines.push(`姓名: ${personaData.name} | 角色: ${personaData.role} | 年龄: ${personaData.age} | 收入: ${personaData.income}`);
    lines.push(`技术熟悉度: ${personaData.techSavviness}/100 | 消费能力: ${personaData.spendingCapacity}/100`);
    if (personaData.painPoints.length) lines.push(`痛点: ${personaData.painPoints.join("；")}`);
    if (personaData.goals.length) lines.push(`目标: ${personaData.goals.join("；")}`);
    if (personaData.description) lines.push(`描述: ${personaData.description}`);
  }

  // Market
  lines.push("");
  lines.push(`## 市场分析`);
  lines.push(`目标受众: ${marketAnalysis.targetAudience}`);
  lines.push(`市场规模: ${marketAnalysis.marketSize}`);
  lines.push(`竞争程度: ${marketAnalysis.competitionLevel}`);
  lines.push(`趋势方向: ${marketAnalysis.trendDirection}`);
  if (marketAnalysis.keywords.length) lines.push(`关键词: ${marketAnalysis.keywords.join(", ")}`);

  // Sentiment
  lines.push("");
  lines.push(`## 情感分析`);
  lines.push(`正面 ${sentimentAnalysis.positive}% | 中性 ${sentimentAnalysis.neutral}% | 负面 ${sentimentAnalysis.negative}%`);
  if (sentimentAnalysis.topPositive.length) lines.push(`正面关键词: ${sentimentAnalysis.topPositive.join(", ")}`);
  if (sentimentAnalysis.topNegative.length) lines.push(`负面关键词: ${sentimentAnalysis.topNegative.join(", ")}`);

  // Strengths / Weaknesses / Risks
  if (aiAnalysis.strengths.length || aiAnalysis.weaknesses.length) {
    lines.push("");
    lines.push(`## 优势与劣势`);
    if (aiAnalysis.strengths.length) lines.push(`优势: ${aiAnalysis.strengths.join("；")}`);
    if (aiAnalysis.weaknesses.length) lines.push(`劣势: ${aiAnalysis.weaknesses.join("；")}`);
    if (aiAnalysis.risks.length) lines.push(`风险: ${aiAnalysis.risks.join("；")}`);
    if (aiAnalysis.suggestions.length) lines.push(`建议: ${aiAnalysis.suggestions.join("；")}`);
  }

  // Monetization
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

  // Brand names
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

  // Real user voices
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

  // Competitor data
  if (competitorRows.length) {
    lines.push("");
    lines.push(`## 竞品信息`);
    for (const c of competitorRows.slice(0, 6)) {
      const title = (c as any)?.title || "竞品";
      const snippet = (c as any)?.snippet || "";
      lines.push(`- ${title}: ${snippet.slice(0, 120)}`);
    }
  }

  // Data summary if exists
  const dataSummary = (r.report?.data_summary ?? null) as Record<string, unknown> | null;
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

/**
 * Build the initial prompt message that wraps the context.
 */
export function buildOpenClawPrompt(context: string, task: "xiaohongshu" | "competitor" | "brainstorm" = "xiaohongshu"): string {
  const taskInstructions: Record<string, string> = {
    xiaohongshu: `请基于以上验证报告数据，帮我撰写一篇适合在小红书发布的种草/测评文案。要求：
1. 标题要有吸引力，带 emoji，15字以内
2. 正文分段清晰，包含痛点引入、解决方案、使用体验、号召行动
3. 文案风格贴合目标用户画像
4. 结尾附上 5-8 个相关话题标签
5. 可以参考样本笔记的爆款元素`,

    competitor: `请基于以上验证报告数据，帮我深入分析竞品差异化策略。要求：
1. 总结现有竞品的共同特点和差距
2. 找出我的产品可以切入的差异化角度
3. 给出具体的定位建议和卖点提炼`,

    brainstorm: `请基于以上验证报告数据，帮我进行创意头脑风暴。要求：
1. 基于验证数据提出 3-5 个产品变体方向
2. 每个方向说明切入角度、目标人群、核心卖点
3. 评估每个方向的可行性和市场潜力`,
  };

  return `以下是我的创业想法的完整验证报告数据：\n\n${context}\n\n---\n\n${taskInstructions[task]}`;
}
