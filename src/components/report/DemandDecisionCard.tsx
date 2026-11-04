import { useState, useEffect } from "react";
import { GlassCard } from "@/components/shared";
import { ChevronDown, Quote } from "lucide-react";
import { useSkinToast } from "@/hooks/useSkinToast";
import { researchDecisionLabel } from './useReportData';

interface DemandDecisionCardProps {
  validation: { id: string; overall_score: number | null };
  xiaohongshuData: { totalNotes: number; totalEngagement: number };
  sentimentAnalysis: { positive: number | null };
  marketAnalysis: { competitionLevel?: string; targetAudience?: string };
  aiAnalysis: { overallVerdict?: string; strengths?: string[]; analysisStatus?: string; decision?: string; evidenceAssessment?: { support: Array<{ claim: string; evidenceIds: string[] }>; counter: Array<{ claim: string; evidenceIds: string[] }>; unknowns: string[]; nextExperiment: string } };
  proofResult: { verdict: string; paidIntentRate: number | null; waitlistRate: number | null; sampleUv: number };
  costBreakdown: { estCost: number; llmCalls: number; externalApiCalls: number; crawlerCalls: number; promptTokens: number; completionTokens: number; latencyMs: number; crawlerLatencyMs: number };
  topEvidence: string[];
  evidenceSummary: string;
  evidenceItems: Array<{ id?: string; type: string; title: string; snippet?: string; url?: string; fullText?: string }>;
  platforms?: { name: string; count: number }[];
  score?: number | null;
}

const useCountUp = (target: number, duration = 800) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    setValue(0);
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
};

export const DemandDecisionCard = ({
  validation, score: displayScore, xiaohongshuData, sentimentAnalysis, marketAnalysis,
  aiAnalysis, proofResult, costBreakdown, topEvidence, evidenceSummary, evidenceItems, platforms,
}: DemandDecisionCardProps) => {
  const skinToast = useSkinToast();
  const score = displayScore;
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const animatedNotes = useCountUp(xiaohongshuData.totalNotes);
  const animatedEngagement = useCountUp(xiaohongshuData.totalEngagement);
  const animatedPositive = useCountUp(sentimentAnalysis.positive ?? 0);

  const visibleEvidence = evidenceExpanded ? evidenceItems : evidenceItems.slice(0, 3);

  const verdictLabel = researchDecisionLabel(aiAnalysis.analysisStatus, aiAnalysis.decision);
  const verdictClass = aiAnalysis.analysisStatus === 'complete' && aiAnalysis.decision === 'test' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-orange-500/10 text-orange-500 border-orange-500/20';
  const evidenceAssessment = aiAnalysis.evidenceAssessment;
  const claim = (item: { claim: string; evidenceIds: string[] }, i: number) => <div key={i} className="mb-2"><p>{item.claim}</p><div className="mt-1 flex flex-wrap gap-2">{item.evidenceIds.map(id => <a key={id} className="text-xs text-primary underline" href={`#report-evidence-${encodeURIComponent(id)}`} onClick={() => setEvidenceExpanded(true)}>证据 {id}</a>)}</div></div>;

  return (
    <GlassCard className="mb-10 overflow-hidden border-none shadow-2xl bg-gradient-to-br from-card/80 to-card/40 animate-slide-up ring-1 ring-white/10">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      <div className="p-6 md:p-8 space-y-5">
        {/* Verdict Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-sm uppercase tracking-wider text-muted-foreground font-semibold border-l-[3px] border-primary pl-3">需求验证结论</div>
          <div className={`text-lg font-bold px-5 py-1.5 rounded-full border ${verdictClass}`}>
            {verdictLabel}
          </div>
          <p className="text-sm text-muted-foreground">已采集 {xiaohongshuData.totalNotes} 条去重帖子</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30 border-l-[3px] border-l-primary">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">样本量</div>
            <div className="text-2xl font-semibold">{animatedNotes.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">条</span></div>
            <div className="text-xs text-muted-foreground">样本数量不代表需求成立</div>
          </div>
          <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">数据源</div>
            <div className="text-2xl font-semibold">{platforms?.filter(p => p.count > 0).length || 0} <span className="text-sm text-muted-foreground font-normal">个平台</span></div>
            <div className="text-xs text-muted-foreground">仅计有样本的平台</div>
          </div>
          <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">互动热度</div>
            <div className="text-2xl font-semibold">{animatedEngagement.toLocaleString()}</div>
          </div>
          <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">用户态度</div>
            <div className={`text-2xl font-semibold ${sentimentAnalysis.positive > 60 ? 'text-green-500' : 'text-foreground'}`}>
            {sentimentAnalysis.positive === null ? '未知' : `${animatedPositive}%`} <span className="text-sm text-muted-foreground font-normal">正向</span>
            </div>
          </div>
        </div>

        {/* Verdicts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 relative">
            <Quote className="w-4 h-4 text-primary/20 absolute top-2 right-2" />
            <div className="text-xs text-muted-foreground mb-1">市场信号结论</div>
            <div className="text-sm font-medium italic">{aiAnalysis.overallVerdict}</div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 relative">
            <Quote className="w-4 h-4 text-emerald-500/20 absolute top-2 right-2" />
            <div className="text-xs text-muted-foreground mb-1">商业可行性（付费意图）</div>
            <div className="text-sm font-medium">
              {proofResult.verdict}{proofResult.sampleUv > 0 && proofResult.paidIntentRate !== null ? ` · 付费意图 ${Math.round(proofResult.paidIntentRate * 100)}% · Waitlist ${Math.round((proofResult.waitlistRate || 0) * 100)}%` : ' · 尚未取得实验数据'}
            </div>
          </div>
        </div>

        {/* Evidence Summary */}
        <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
          <div className="text-xs text-muted-foreground mb-1">结论证据摘要</div>
          <div className="text-sm font-medium">
            {evidenceSummary}
          </div>
        </div>

        {evidenceAssessment && (evidenceAssessment.support.length > 0 || evidenceAssessment.counter.length > 0 || evidenceAssessment.unknowns.length > 0 || evidenceAssessment.nextExperiment) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"><div className="mb-1 text-xs text-muted-foreground">支持证据</div>{evidenceAssessment.support.length ? evidenceAssessment.support.map(claim) : <p className="text-muted-foreground">尚未取得可追溯的支持证据</p>}</div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-sm"><div className="mb-1 text-xs text-muted-foreground">反证与未知</div>{evidenceAssessment.counter.map(claim)}{evidenceAssessment.unknowns.map((item, i) => <p key={`u-${i}`} className="text-muted-foreground"><span>{item}</span></p>)}</div>
            {evidenceAssessment.nextExperiment && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm md:col-span-2"><span className="text-xs text-muted-foreground">下一步实验：</span> {evidenceAssessment.nextExperiment}</div>}
          </div>
        )}

        {/* Evidence Sources - collapsible */}
        <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">证据溯源（可点击）</div>
            {evidenceItems.length > 3 && (
              <button
                onClick={() => setEvidenceExpanded(!evidenceExpanded)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {evidenceExpanded ? "收起" : `展开全部 ${evidenceItems.length} 条`}
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${evidenceExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {visibleEvidence.length > 0 ? (
            <div className="space-y-2">
              {visibleEvidence.map((item, idx) => (
                <div key={`${item.type}-${idx}`} id={item.id ? `report-evidence-${encodeURIComponent(item.id)}` : undefined} className="text-sm flex items-start justify-between gap-3 scroll-mt-24">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      [{item.type === "note" ? "帖子" : item.type === "comment" ? "评论" : item.type === 'research' ? '原文证据' : "网页"}] {item.title}
                    </div>
                    {item.snippet && <div className="text-xs text-muted-foreground truncate">{item.snippet}</div>}
                  </div>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0" aria-label={`${item.title} · 查看来源`}>查看来源</a>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">展开原文</summary>
                        <div className="mt-1 max-w-[280px] break-words text-muted-foreground">{item.fullText || item.snippet || "无内容"}</div>
                      </details>
                      <button type="button" className="text-xs text-primary hover:underline" onClick={async () => {
                        const content = item.fullText || item.snippet || "";
                        if (!content) return;
                        try { await navigator.clipboard.writeText(content); skinToast.success("已复制证据原文"); }
                        catch { skinToast.error("复制失败: 请手动复制"); }
                      }}>复制</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">暂无可展示证据</div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
