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

export type OpenClawTaskType = "xiaohongshu_publish" | "marketing_image" | "competitor_research" | "brainstorm" | "xiaohongshu" | "content_pipeline";

/**
 * Build the initial prompt message that wraps the context.
 * Prompts explicitly instruct Agent to use its built-in tools.
 */
export function buildOpenClawPrompt(context: string, task: OpenClawTaskType = "xiaohongshu"): string {
  const taskInstructions: Record<OpenClawTaskType, string> = {
    xiaohongshu: `请基于以上验证报告数据，帮我撰写一篇适合在小红书发布的种草/测评文案。要求：
1. 标题要有吸引力，带 emoji，15字以内
2. 正文分段清晰，包含痛点引入、解决方案、使用体验、号召行动
3. 文案风格贴合目标用户画像
4. 结尾附上 5-8 个相关话题标签
5. 可以参考样本笔记的爆款元素`,

    xiaohongshu_publish: `请基于以上验证报告数据，完成完整的小红书发布流程：
1. 撰写一篇小红书种草文案（标题+正文+标签），标题带 emoji，15字以内
2. 使用你的图片生成工具，为文案生成 1-3 张适合小红书的配图
3. 使用你的小红书发布工具，将文案和配图发布到小红书
每完成一步请告诉我进度。如果某个工具不可用，请告知并继续完成其余步骤。`,

    marketing_image: `请基于以上验证报告数据，为我的产品生成营销素材：
1. 分析目标用户画像和产品卖点，确定视觉风格方向
2. 使用你的图片生成工具，生成 2-3 张适合小红书/朋友圈传播的营销配图
3. 为每张图片配上简短的文案说明
风格要求：现代简洁，符合目标受众审美。`,

    competitor_research: `请基于以上验证报告数据，进行深度竞品调研：
1. 使用你的搜索工具，联网搜索主要竞品的最新动态、定价策略和用户评价
2. 分析竞品的共同特点和差距，找出差异化切入点
3. 输出一份完整的竞品调研报告，包含定位建议和卖点提炼
4. 请将调研报告保存到 workspace/competitor-report.md`,

    brainstorm: `请基于以上验证报告数据，进行创意头脑风暴：
1. 基于验证数据中的用户痛点和市场机会，提出 5 个产品变体方向
2. 每个方向说明切入角度、目标人群、核心卖点和预估可行性
3. 评估每个方向的市场潜力（大/中/小）
4. 请将结果保存到 workspace/ideas.md`,

    content_pipeline: `请基于以上内容信息，完成多平台内容生产流水线：

## 第一步：联网调研
使用你的搜索工具，围绕给定主题搜索最新资讯、热门观点和用户痛点，整理 3-5 个关键角度。

## 第二步：生成长文主稿
基于调研结果，撰写一篇 800-1200 字的深度长文，包含：引言、核心论点（2-3个）、案例/数据支撑、结论与行动号召。
请严格遵循品牌 Voice 设定（语气、人设、关键词）。

## 第三步：拆分为三个平台版本

### 🔴 小红书版本
- 标题：15字以内，带 emoji，吸引力强
- 正文：300-500字，分段清晰，口语化，带个人体验感
- 结尾：5-8 个话题标签
- 保存到 workspace/draft-xiaohongshu.md

### 🐦 Twitter/X 版本
- 主推文：280字符以内，简洁有力
- 补充 Thread（3-5条），每条独立成段
- 保存到 workspace/draft-twitter.md

### 📱 公众号版本
- 标题：吸引点击，20字以内
- 正文：800-1500字，结构化分段，专业深度
- 结尾：引导关注 + 互动话题
- 保存到 workspace/draft-wechat.md

每完成一个平台版本，请告知进度。最后输出三个版本的摘要供审核。`,
  };

  return `以下是我的创业想法的完整验证报告数据：\n\n${context}\n\n---\n\n${taskInstructions[task]}`;
}
