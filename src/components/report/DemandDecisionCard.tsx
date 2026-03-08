import { GlassCard } from "@/components/shared";
import { Target, Brain, Swords } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DemandDecisionCardProps {
  validation: { id: string; overall_score: number | null };
  score: number;
  xiaohongshuData: { totalNotes: number; totalEngagement: number };
  sentimentAnalysis: { positive: number };
  marketAnalysis: { competitionLevel?: string; targetAudience?: string };
  aiAnalysis: { overallVerdict?: string; strengths?: string[] };
  proofResult: { verdict: string; paidIntentRate: number; waitlistRate: number; sampleUv: number };
  costBreakdown: { estCost: number; llmCalls: number; externalApiCalls: number; crawlerCalls: number; promptTokens: number; completionTokens: number; latencyMs: number; crawlerLatencyMs: number };
  topEvidence: string[];
  evidenceItems: Array<{ type: string; title: string; snippet?: string; url?: string; fullText?: string }>;
}

export const DemandDecisionCard = ({
  validation, score: displayScore, xiaohongshuData, sentimentAnalysis, marketAnalysis,
  aiAnalysis, proofResult, costBreakdown, topEvidence, evidenceItems,
}: DemandDecisionCardProps) => {
  const { toast } = useToast();
  const score = displayScore;

  return (
    <GlassCard className="mb-10 overflow-hidden border-none shadow-2xl bg-gradient-to-br from-card/80 to-card/40 animate-slide-up ring-1 ring-white/10">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        {/* Left: Score Summary */}
        <div className="col-span-1 lg:col-span-4 flex flex-col justify-center items-center lg:items-start border-b lg:border-b-0 lg:border-r border-border/50 pb-8 lg:pb-0 lg:pr-8">
          <div className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">需求验证结论</div>
          <div className="flex items-baseline gap-4 mb-4">
            <span className="text-7xl font-bold tracking-tighter text-foreground">{score}</span>
            <span className="text-2xl text-muted-foreground font-light">/ 100</span>
          </div>
          <div className={`text-2xl font-bold px-6 py-2 rounded-full mb-4 ${score >= 90 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
            score >= 70 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
              score >= 40 ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
            {score >= 90 ? "🔥 强烈刚需" : score >= 70 ? "✅ 真实需求" : score >= 40 ? "⚠️ 需求存疑" : "❌ 伪需求警告"}
          </div>
          <p className="text-sm text-center lg:text-left text-muted-foreground">(基于 {xiaohongshuData.totalNotes} 条真实用户反馈)</p>
        </div>

        {/* Right: Details */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-5 content-center">
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">用户讨论量</div>
              <div className="text-2xl font-semibold">{xiaohongshuData.totalNotes.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">条</span></div>
            </div>
            <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">用户互动热度</div>
              <div className="text-2xl font-semibold">{xiaohongshuData.totalEngagement.toLocaleString()}</div>
            </div>
            <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">用户态度</div>
              <div className={`text-2xl font-semibold ${sentimentAnalysis.positive > 60 ? 'text-green-500' : 'text-foreground'}`}>
                {sentimentAnalysis.positive}% <span className="text-sm text-muted-foreground font-normal">正向</span>
              </div>
            </div>
          </div>

          {/* Competition */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500/5 to-amber-500/5 border border-orange-500/20">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-orange-500/10 shrink-0"><Swords className="w-5 h-5 text-orange-500" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">竞品拥挤度分析</div>
                <div className="text-sm text-foreground leading-relaxed">{marketAnalysis.competitionLevel || "暂无竞争分析数据"}</div>
              </div>
            </div>
          </div>

          {/* Target & Pain */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/5 border border-secondary/10">
              <Target className="w-5 h-5 text-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">目标用户</div>
                <div className="text-sm font-medium line-clamp-2">{marketAnalysis.targetAudience || "数据未完成采集"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Brain className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">核心痛点</div>
                <div className="text-sm font-medium line-clamp-2">{aiAnalysis.strengths?.[0] || "数据未完成采集"}</div>
              </div>
            </div>
          </div>

          {/* Verdicts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="text-xs text-muted-foreground mb-1">市场信号结论</div>
              <div className="text-sm font-medium">{aiAnalysis.overallVerdict}</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="text-xs text-muted-foreground mb-1">商业可行性（付费意图）</div>
              <div className="text-sm font-medium">
                {proofResult.verdict} · 付费意图 {Math.round(proofResult.paidIntentRate * 100)}% · Waitlist {Math.round(proofResult.waitlistRate * 100)}%
              </div>
            </div>
          </div>

          {/* Evidence Summary */}
          <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
            <div className="text-xs text-muted-foreground mb-1">结论证据摘要</div>
            <div className="text-sm font-medium">
              {topEvidence.length > 0 ? topEvidence.join(" · ") : "当前样本不足，建议增加关键词并重跑验证"}
            </div>
          </div>

          {/* Evidence Sources */}
          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
            <div className="text-xs text-muted-foreground mb-2">证据溯源（可点击）</div>
            {evidenceItems.length > 0 ? (
              <div className="space-y-2">
                {evidenceItems.slice(0, 6).map((item, idx) => (
                  <div key={`${item.type}-${idx}`} className="text-sm flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        [{item.type === "note" ? "笔记" : item.type === "comment" ? "评论" : "竞品"}] {item.title}
                      </div>
                      {item.snippet && <div className="text-xs text-muted-foreground truncate">{item.snippet}</div>}
                    </div>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">查看来源</a>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">展开原文</summary>
                          <div className="mt-1 max-w-[280px] break-words text-muted-foreground">{item.fullText || item.snippet || "无内容"}</div>
                        </details>
                        <button type="button" className="text-xs text-primary hover:underline" onClick={async () => {
                          const content = item.fullText || item.snippet || "";
                          if (!content) return;
                          try { await navigator.clipboard.writeText(content); toast({ title: "已复制证据原文" }); }
                          catch { toast({ title: "复制失败", description: "请手动复制", variant: "destructive" }); }
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
      </div>
    </GlassCard>
  );
};
