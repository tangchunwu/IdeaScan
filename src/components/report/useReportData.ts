import type { FullValidation } from "@/services/validationService";

const PLACEHOLDER_PATTERNS = ["综合评估中", "待分析", "目标用户群体分析中", "pending_experiment"];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const percentage = (value: unknown) => { const n = numberOrNull(value); return n !== null && n <= 100 ? n : null; };
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [];
export const cleanDisplayText = (value: unknown, fallback: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && !PLACEHOLDER_PATTERNS.some(p => text.includes(p)) ? text : fallback;
};
const sourceUrl = (value: unknown): string | undefined => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
};

export type AnalysisStatus = 'complete' | 'incomplete' | 'legacy';
export type ResearchDecision = 'test' | 'reframe' | 'pause' | 'insufficient';
export interface EvidenceClaim { claim: string; evidenceIds: string[] }
export interface EvidenceAssessment { support: EvidenceClaim[]; counter: EvidenceClaim[]; unknowns: string[]; nextExperiment: string }
export function researchDecisionLabel(status?: string, decision?: string): string {
  if (status === 'incomplete') return '分析未完成';
  if (status !== 'complete') return '旧版研究判断';
  return ({ test: '值得小测', reframe: '需要调整', pause: '暂缓', insufficient: '证据不足' } as Record<string, string>)[decision || ''] || '证据不足';
}
export const mapProofVerdictLabel = (value: unknown) => {
  const raw = String(value || '').toLowerCase();
  return ({ pending_experiment: '尚未实验', pass: '意图实验通过', fail: '意图实验未通过', insufficient_data: '实验样本不足', validated_paid_intent: '已观察到付费意图', promising_need: '存在初步意图信号', needs_iteration: '需要调整实验', weak_signal: '意图信号较弱' } as Record<string, string>)[raw] || (raw ? '实验状态待核实' : '尚未实验');
};
export type EvidenceItem = { id?: string; type: 'note' | 'comment' | 'competitor' | 'research'; title: string; snippet: string; fullText?: string; url?: string };
const platformLabels: Record<string, string> = { xiaohongshu: '小红书', douyin: '抖音', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit', twitter: 'X / Twitter', threads: 'Threads' };
function uniqueSamples(items: Record<string, unknown>[], comment = false) {
  const result = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const id = String(comment ? item.comment_id || item.id || item.content || '' : item.note_id || item.id || `${item.title || ''}|${item.desc || ''}`);
    if (!id || id === '|') continue;
    const platform = item._platform || item.platform || 'unknown';
    const key = `${platform}:${id}`;
    if (!result.has(key)) result.set(key, item);
  }
  return [...result.values()];
}

export function deriveReportData(data: FullValidation | null | undefined) {
  if (!data?.validation || !data?.report) return null;
  const { validation, report } = data;
  const dataSummaryRaw = record(report.data_summary);
  const overseasSocialData = dataSummaryRaw.overseasSocialData || null;
  const rawSocial = record(report.xiaohongshu_data);
  const sampleNotes = uniqueSamples(rows(rawSocial.sampleNotes));
  const sampleComments = uniqueSamples(rows(rawSocial.sampleComments), true);
  const totalNotes = sampleNotes.length;
  const sum = (field: string) => sampleNotes.reduce((total, item) => total + (numberOrNull(item[field]) ?? 0), 0);
  const avg = (field: string) => totalNotes ? Math.round(sum(field) / totalNotes) : 0;
  const counts = new Map<string, number>();
  sampleNotes.forEach(note => { const p = String(note._platform || note.platform || 'unknown'); counts.set(p, (counts.get(p) || 0) + 1); });
  const platforms = [...counts].map(([platform, count]) => ({ name: platformLabels[platform] || '来源未标注', count }));
  const measuredTrend = rows(rawSocial.weeklyTrend).filter(item => typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && numberOrNull(item.value) !== null);
  const typeCounts = new Map<string, number>();
  sampleNotes.forEach(note => { if (typeof note.type === 'string' && ['text', 'image', 'video', 'mixed'].includes(note.type)) typeCounts.set(note.type, (typeCounts.get(note.type) || 0) + 1); });
  const xiaohongshuData = {
    totalNotes, estimatedTotalNotes: numberOrNull(rawSocial.totalNotes), avgLikes: avg('liked_count'), avgComments: avg('comments_count'), avgCollects: avg('collected_count'),
    totalEngagement: sum('liked_count') + sum('comments_count') + sum('collected_count') + sum('shared_count'),
    weeklyTrend: measuredTrend,
    contentTypes: [...typeCounts].map(([name, count]) => ({ name: ({ text: '文字', image: '图文', video: '视频', mixed: '混合' } as Record<string, string>)[name], value: Math.round(count / totalNotes * 100) })),
    sampleNotes, sampleComments,
  };
  const marketRaw = record(report.market_analysis);
  const marketAnalysis = {
    targetAudience: cleanDisplayText(marketRaw.targetAudience, '目标用户尚未确认'), marketSize: cleanDisplayText(marketRaw.marketSize, '尚未取得市场规模证据'),
    competitionLevel: cleanDisplayText(marketRaw.competitionLevel, '竞争情况尚未确认'), trendDirection: cleanDisplayText(marketRaw.trendDirection, '趋势尚未确认'), keywords: strings(marketRaw.keywords),
  };
  const aiRaw = record(report.ai_analysis);
  const rawStatus = aiRaw.analysisStatus || dataSummaryRaw.analysisStatus;
  const analysisStatus: AnalysisStatus = rawStatus === 'complete' || rawStatus === 'incomplete' ? rawStatus : 'legacy';
  const proposedDecision: ResearchDecision = typeof aiRaw.decision === 'string' && ['test', 'reframe', 'pause', 'insufficient'].includes(aiRaw.decision) ? aiRaw.decision as ResearchDecision : 'insufficient';
  const sentimentRaw = record(report.sentiment_analysis);
  const sentimentAnalysis = { positive: analysisStatus === 'incomplete' ? null : percentage(sentimentRaw.positive), neutral: analysisStatus === 'incomplete' ? null : percentage(sentimentRaw.neutral), negative: analysisStatus === 'incomplete' ? null : percentage(sentimentRaw.negative), topPositive: strings(sentimentRaw.topPositive), topNegative: strings(sentimentRaw.topNegative) };
  const rawEvidence = [...rows(dataSummaryRaw.validationEvidence), ...rows(dataSummaryRaw.researchEvidence)];
  const validationEvidence = [...new Map(rawEvidence.filter(e => typeof e.id === 'string').map(e => [e.id, { ...e, id: String(e.id), title: cleanDisplayText(e.title, '原文证据'), snippet: cleanDisplayText(e.snippet, ''), url: sourceUrl(e.url) }])).values()];
  const evidenceIds = new Set(validationEvidence.map(e => e.id));
  const assessmentRaw = record(aiRaw.evidenceAssessment);
  const claims = (value: unknown): EvidenceClaim[] => rows(value).map(item => ({ claim: cleanDisplayText(item.claim, ''), evidenceIds: strings(item.evidenceIds).filter(id => evidenceIds.has(id)) })).filter(item => item.claim && item.evidenceIds.length > 0);
  const evidenceAssessment: EvidenceAssessment = { support: claims(assessmentRaw.support), counter: claims(assessmentRaw.counter), unknowns: strings(assessmentRaw.unknowns), nextExperiment: cleanDisplayText(assessmentRaw.nextExperiment, '') };
  const decision: ResearchDecision = proposedDecision === 'test' && !evidenceAssessment.support.length ? 'insufficient' : proposedDecision;
  const aiAnalysis = {
    analysisStatus, decision, evidenceAssessment,
    feasibilityScore: analysisStatus === 'incomplete' || analysisStatus === 'complete' && decision === 'insufficient' ? null : percentage(aiRaw.feasibilityScore),
    strengths: strings(aiRaw.strengths), weaknesses: strings(aiRaw.weaknesses), risks: strings(aiRaw.risks),
    suggestions: Array.isArray(aiRaw.suggestions) ? aiRaw.suggestions : [],
    monetizationStrategies: Array.isArray(aiRaw.monetizationStrategies) ? aiRaw.monetizationStrategies : [], brandNames: Array.isArray(aiRaw.brandNames) ? aiRaw.brandNames : [],
    overallVerdict: cleanDisplayText(aiRaw.overallVerdict, analysisStatus === 'incomplete' ? '分析尚未完成，已保留采集证据。' : '目前尚无可追溯的完整研究结论。'),
  };
  const evidenceGrade = ['A', 'B', 'C', 'D'].includes(String(report.evidence_grade)) ? String(report.evidence_grade) : '未评定';
  const proofRaw = record(report.proof_result);
  const sampleUv = numberOrNull(proofRaw.sample_uv) ?? 0;
  const proofResult = { paidIntentRate: sampleUv > 0 ? numberOrNull(proofRaw.paid_intent_rate) : null, waitlistRate: sampleUv > 0 ? numberOrNull(proofRaw.waitlist_rate) : null, sampleUv, verdict: sampleUv > 0 ? mapProofVerdictLabel(proofRaw.verdict) : '尚未实验' };
  const costRaw = record(report.cost_breakdown);
  const costBreakdown = { llmCalls: Number(costRaw.llm_calls || 0), promptTokens: Number(costRaw.prompt_tokens || 0), completionTokens: Number(costRaw.completion_tokens || 0), externalApiCalls: Number(costRaw.external_api_calls || 0), estCost: Number(costRaw.est_cost || 0), latencyMs: Number(costRaw.latency_ms || 0), crawlerCalls: Number(costRaw.crawler_calls || 0), crawlerLatencyMs: Number(costRaw.crawler_latency_ms || 0) };
  const dimensions = (analysisStatus === 'incomplete' ? [] : rows(report.dimensions)).filter(d => percentage(d.score) !== null && typeof d.dimension === 'string').map(d => ({ dimension: d.dimension as string, score: d.score as number, reason: cleanDisplayText(d.reason, '未提供该维度的证据说明') }));
  const radarData = dimensions.map(d => ({ subject: d.dimension, A: d.score, fullMark: 100 }));
  const rawPersona = record(report.persona);
  const personaData = rawPersona.name ? { name: String(rawPersona.name), role: String(rawPersona.role || '身份待确认'), age: String(rawPersona.age || '年龄待确认'), income: String(rawPersona.income || '收入待确认'), painPoints: strings(rawPersona.painPoints), goals: strings(rawPersona.goals), techSavviness: numberOrNull(rawPersona.techSavviness), spendingCapacity: numberOrNull(rawPersona.spendingCapacity), description: String(rawPersona.description || '画像仍需用户研究核实'), avatarUrl: sourceUrl(rawPersona.avatarUrl) } : null;
  const competitorRows = rows(report.competitor_data);
  const evidenceItems: EvidenceItem[] = [
    ...validationEvidence.map(e => ({ id: e.id, type: 'research' as const, title: e.title, snippet: e.snippet, fullText: e.snippet, url: e.url })),
    ...sampleNotes.slice(0, 4).map(n => ({ type: 'note' as const, title: cleanDisplayText(n.title, '样本帖子'), snippet: cleanDisplayText(n.desc, '').slice(0, 90), fullText: cleanDisplayText(n.desc, ''), url: sourceUrl(n.url) })),
    ...sampleComments.slice(0, 4).map(c => ({ type: 'comment' as const, title: `评论 · ${cleanDisplayText(c.user_nickname, '匿名用户')}`, snippet: cleanDisplayText(c.content, '').slice(0, 90), fullText: cleanDisplayText(c.content, ''), url: sourceUrl(c.url) })),
    ...competitorRows.slice(0, 4).map(c => ({ type: 'competitor' as const, title: cleanDisplayText(c.title, '竞品页面'), snippet: cleanDisplayText(c.snippet, '').slice(0, 90), fullText: cleanDisplayText(c.snippet, ''), url: sourceUrl(c.url) })),
  ];
  const topEvidence = evidenceItems.slice(0, 4).map(e => e.snippet || e.title);
  const evidenceSummary = `本报告可查看 ${totalNotes} 条去重帖子、${sampleComments.length} 条评论和 ${competitorRows.length} 条网页记录。${analysisStatus === 'incomplete' ? '分析未完成，尚不具备需求判断。' : '公开讨论提供研究线索，仍需用户行为与付款验证。'}`;
  return { validation, report, marketAnalysis, xiaohongshuData, sentimentAnalysis, aiAnalysis, evidenceGrade, proofResult, costBreakdown, dimensions, radarData, personaData, competitorRows, evidenceItems, topEvidence, evidenceSummary, overseasSocialData, platforms, validationEvidence };
}
// 保留原调用名；数据规范化本身不依赖 React 生命周期，可独立验证。
export const useReportData = deriveReportData;
export type ReportDataResult = NonNullable<ReturnType<typeof useReportData>>;
