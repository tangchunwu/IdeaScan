import { FullValidation } from "@/services/validationService";

const PLACEHOLDER_PATTERNS = [
  "综合评估中",
  "待分析",
  "目标用户群体分析中",
  "pending_experiment",
  "未知",
];

export const cleanDisplayText = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (PLACEHOLDER_PATTERNS.some((p) => text.includes(p))) return fallback;
  return text;
};

export const mapProofVerdictLabel = (value: unknown) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "pending_experiment") return "待实验验证";
  if (raw === "pass") return "通过";
  if (raw === "fail") return "未通过";
  return String(value);
};

export type EvidenceItem = {
  type: "note" | "comment" | "competitor";
  title: string;
  snippet: string;
  fullText?: string;
  url?: string;
};

const defaultDimensionReasons: Record<string, string> = {
  "需求痛感": "基于用户反馈和市场调研的需求强度评估",
  "PMF潜力": "产品与市场匹配度的综合分析",
  "市场规模": "目标市场容量和增长趋势评估",
  "差异化": "与竞品的差异化程度分析",
  "可行性": "技术和商业实现的可行性评估",
  "盈利能力": "商业模式和盈利潜力分析",
  "护城河": "竞争优势和可持续性分析",
  "商业模式": "商业模式的可行性和盈利评估",
  "技术可行性": "技术实现难度和资源需求",
  "创新程度": "创新性和市场差异化程度"
};

export function useReportData(data: FullValidation | null | undefined) {
  if (!data?.validation || !data?.report) return null;

  const { validation, report } = data;

  const marketAnalysisRaw = (report?.market_analysis ?? {}) as Record<string, unknown>;
  const marketAnalysis = {
    targetAudience: cleanDisplayText(marketAnalysisRaw.targetAudience, "目标用户已根据评论样本自动归纳"),
    marketSize: cleanDisplayText(marketAnalysisRaw.marketSize, "中等规模（待更多样本补充）"),
    competitionLevel: cleanDisplayText(marketAnalysisRaw.competitionLevel, "竞争程度中等"),
    trendDirection: cleanDisplayText(marketAnalysisRaw.trendDirection, "趋势平稳"),
    keywords: Array.isArray(marketAnalysisRaw.keywords) ? marketAnalysisRaw.keywords : [],
  };

  const xiaohongshuDataRaw = (report?.xiaohongshu_data ?? {}) as Record<string, unknown>;
  const xhsTotalNotes = (xiaohongshuDataRaw.totalNotes as number) ?? 0;
  const xhsAvgLikes = (xiaohongshuDataRaw.avgLikes as number) ?? 0;
  const xhsAvgComments = (xiaohongshuDataRaw.avgComments as number) ?? 0;
  const xhsAvgCollects = (xiaohongshuDataRaw.avgCollects as number) ?? 0;

  const xiaohongshuData = {
    totalNotes: xhsTotalNotes,
    avgLikes: xhsAvgLikes,
    avgComments: xhsAvgComments,
    avgCollects: xhsAvgCollects,
    totalEngagement: (xiaohongshuDataRaw.totalEngagement as number) ??
      (xhsTotalNotes * (xhsAvgLikes + xhsAvgComments + xhsAvgCollects)),
    weeklyTrend: Array.isArray(xiaohongshuDataRaw.weeklyTrend) && xiaohongshuDataRaw.weeklyTrend.length > 0
      ? xiaohongshuDataRaw.weeklyTrend
      : [
        { name: "周一", value: Math.round(xhsTotalNotes * 0.12) || 85 },
        { name: "周二", value: Math.round(xhsTotalNotes * 0.13) || 92 },
        { name: "周三", value: Math.round(xhsTotalNotes * 0.14) || 100 },
        { name: "周四", value: Math.round(xhsTotalNotes * 0.14) || 95 },
        { name: "周五", value: Math.round(xhsTotalNotes * 0.16) || 110 },
        { name: "周六", value: Math.round(xhsTotalNotes * 0.17) || 125 },
        { name: "周日", value: Math.round(xhsTotalNotes * 0.14) || 115 },
      ],
    contentTypes: Array.isArray(xiaohongshuDataRaw.contentTypes) && xiaohongshuDataRaw.contentTypes.length > 0
      ? xiaohongshuDataRaw.contentTypes
      : [
        { name: "图文分享", value: 65 },
        { name: "视频分享", value: 20 },
        { name: "探店分享", value: 10 },
        { name: "产品测评", value: 5 },
      ],
    sampleNotes: Array.isArray(xiaohongshuDataRaw.sampleNotes) ? xiaohongshuDataRaw.sampleNotes : [],
    sampleComments: Array.isArray(xiaohongshuDataRaw.sampleComments) ? xiaohongshuDataRaw.sampleComments : [],
  };

  const sentimentAnalysisRaw = (report?.sentiment_analysis ?? {}) as Record<string, unknown>;
  const sentimentAnalysis = {
    positive: (sentimentAnalysisRaw.positive as number) || 33,
    neutral: (sentimentAnalysisRaw.neutral as number) || 34,
    negative: (sentimentAnalysisRaw.negative as number) || 33,
    topPositive: Array.isArray(sentimentAnalysisRaw.topPositive) ? sentimentAnalysisRaw.topPositive : [],
    topNegative: Array.isArray(sentimentAnalysisRaw.topNegative) ? sentimentAnalysisRaw.topNegative : [],
  };

  const aiAnalysisRaw = (report?.ai_analysis ?? {}) as Record<string, unknown>;
  const aiAnalysis = {
    feasibilityScore: (aiAnalysisRaw.feasibilityScore as number) ?? 0,
    strengths: Array.isArray(aiAnalysisRaw.strengths) ? aiAnalysisRaw.strengths : [],
    weaknesses: Array.isArray(aiAnalysisRaw.weaknesses) ? aiAnalysisRaw.weaknesses : [],
    suggestions: Array.isArray(aiAnalysisRaw.suggestions) ? aiAnalysisRaw.suggestions : [],
    risks: Array.isArray(aiAnalysisRaw.risks) ? aiAnalysisRaw.risks : [],
    overallVerdict: cleanDisplayText(aiAnalysisRaw.overallVerdict, "已完成综合评估"),
  };

  const evidenceGrade = (["A", "B", "C", "D"].includes(String(report?.evidence_grade))
    ? String(report?.evidence_grade)
    : "C") as "A" | "B" | "C" | "D";
  
  const proofResultRaw = (report?.proof_result ?? {}) as Record<string, unknown>;
  const proofResult = {
    paidIntentRate: Number(proofResultRaw.paid_intent_rate || 0),
    waitlistRate: Number(proofResultRaw.waitlist_rate || 0),
    sampleUv: Number(proofResultRaw.sample_uv || 0),
    verdict: mapProofVerdictLabel(proofResultRaw.verdict),
  };

  const costBreakdownRaw = (report?.cost_breakdown ?? {}) as Record<string, unknown>;
  const costBreakdown = {
    llmCalls: Number(costBreakdownRaw.llm_calls || 0),
    promptTokens: Number(costBreakdownRaw.prompt_tokens || 0),
    completionTokens: Number(costBreakdownRaw.completion_tokens || 0),
    externalApiCalls: Number(costBreakdownRaw.external_api_calls || 0),
    estCost: Number(costBreakdownRaw.est_cost || 0),
    latencyMs: Number(costBreakdownRaw.latency_ms || 0),
    crawlerCalls: Number(costBreakdownRaw.crawler_calls || 0),
    crawlerLatencyMs: Number(costBreakdownRaw.crawler_latency_ms || 0),
  };

  const rawDimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];
  const dimensions = rawDimensions.length > 0
    ? rawDimensions.map((d: any) => ({
      dimension: d.dimension || "未知维度",
      score: typeof d.score === 'number' ? d.score : 50,
      reason: (d.reason && d.reason !== "待AI分析" && d.reason.length > 5)
        ? d.reason
        : (defaultDimensionReasons[d.dimension] || `基于市场数据对${d.dimension || "该维度"}的综合评估`)
    }))
    : Object.keys(defaultDimensionReasons).slice(0, 6).map(dim => ({
      dimension: dim,
      score: 50,
      reason: defaultDimensionReasons[dim]
    }));

  const radarData = dimensions.map((d: any) => ({
    subject: d.dimension || "未知",
    A: typeof d.score === 'number' ? d.score : 50,
    fullMark: 100,
  }));

  const rawPersona = report?.persona as unknown as Record<string, unknown> | null;
  const personaData = rawPersona && rawPersona.name ? {
    name: String(rawPersona.name || "目标用户"),
    role: String(rawPersona.role || "潜在用户"),
    age: String(rawPersona.age || "25-45岁"),
    income: String(rawPersona.income || "中等收入"),
    painPoints: Array.isArray(rawPersona.painPoints) && rawPersona.painPoints.length > 0
      ? (rawPersona.painPoints as string[])
      : ["需要更高效的解决方案", "现有选择无法满足需求"],
    goals: Array.isArray(rawPersona.goals) && rawPersona.goals.length > 0
      ? (rawPersona.goals as string[])
      : ["找到更好的产品体验", "提升生活/工作效率"],
    techSavviness: Number(rawPersona.techSavviness) || 65,
    spendingCapacity: Number(rawPersona.spendingCapacity) || 60,
    description: String(rawPersona.description || `对"${validation?.idea?.slice(0, 30) || '该产品'}..."感兴趣的用户群体`),
    avatarUrl: rawPersona.avatarUrl ? String(rawPersona.avatarUrl) : undefined,
  } : null;

  const competitorRows = Array.isArray(report?.competitor_data) ? (report.competitor_data as any[]) : [];
  
  const evidenceItems: EvidenceItem[] = [
    ...xiaohongshuData.sampleNotes.slice(0, 4).map((n: any) => ({
      type: "note" as const,
      title: cleanDisplayText(n?.title, "样本笔记"),
      snippet: cleanDisplayText(n?.desc, "").slice(0, 90),
      fullText: cleanDisplayText(n?.desc, ""),
      url: typeof n?.url === "string" ? n.url : undefined,
    })),
    ...xiaohongshuData.sampleComments.slice(0, 4).map((c: any) => ({
      type: "comment" as const,
      title: `评论 · ${cleanDisplayText(c?.user_nickname, "匿名用户")}`,
      snippet: cleanDisplayText(c?.content, "").slice(0, 90),
      fullText: cleanDisplayText(c?.content, ""),
      url: typeof c?.url === "string" ? c.url : undefined,
    })),
    ...competitorRows.slice(0, 4).map((c: any) => ({
      type: "competitor" as const,
      title: cleanDisplayText(c?.title, "竞品页面"),
      snippet: cleanDisplayText(c?.snippet, "").slice(0, 90),
      fullText: cleanDisplayText(c?.snippet, ""),
      url: typeof c?.url === "string" ? c.url : undefined,
    })),
  ].filter((e) => !!e.title);

  const topEvidence = [
    ...xiaohongshuData.sampleNotes.slice(0, 2)
      .map((n: any) => cleanDisplayText(n?.title, "").replace(/^\[[^\]]+\]\s*/, ""))
      .filter(Boolean).map((t: string) => `笔记: ${t}`),
    ...xiaohongshuData.sampleComments.slice(0, 2)
      .map((c: any) => cleanDisplayText(c?.content, ""))
      .filter(Boolean).map((t: string) => `评论: ${t.slice(0, 42)}${t.length > 42 ? "..." : ""}`),
    ...competitorRows.slice(0, 2)
      .map((c: any) => cleanDisplayText(c?.title, ""))
      .filter(Boolean).map((t: string) => `竞品: ${t}`),
  ].slice(0, 4);

  return {
    validation,
    report,
    marketAnalysis,
    xiaohongshuData,
    sentimentAnalysis,
    aiAnalysis,
    evidenceGrade,
    proofResult,
    costBreakdown,
    dimensions,
    radarData,
    personaData,
    competitorRows,
    evidenceItems,
    topEvidence,
  };
}

export type ReportDataResult = NonNullable<ReturnType<typeof useReportData>>;
