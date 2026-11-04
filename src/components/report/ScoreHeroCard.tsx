import { useState, useEffect } from "react";
import { ScoreCircle } from "@/components/shared";
import { researchDecisionLabel } from "./useReportData";

interface ScoreHeroCardProps {
  score: number | null;
  analysisStatus?: string;
  decision?: string;
  totalNotes: number;
  isIncomplete?: boolean;
  idea?: string;
  overallVerdict?: string;
  strengths?: string[];
  weaknesses?: string[];
  sentiment?: { positive: number; negative: number };
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

const GENERIC_VERDICTS = ["已完成综合评估", "综合评估中", "待分析"];

export const ScoreHeroCard = ({
  score,
  analysisStatus,
  decision,
  totalNotes,
  isIncomplete,
  idea,
  overallVerdict,
  strengths = [],
  weaknesses = [],
}: ScoreHeroCardProps) => {
  const hasScore = score !== null && Number.isFinite(score) && analysisStatus !== 'incomplete';
  const animatedScore = useCountUp(hasScore ? score : 0);
  const label = { text: researchDecisionLabel(analysisStatus, decision), cls: 'bg-primary/10 text-primary border-primary/20' };

  const displayIdea = idea && idea.length > 30 ? idea.slice(0, 30) + "…" : idea;

  const isGenericVerdict = !overallVerdict || GENERIC_VERDICTS.includes(overallVerdict.trim());

  let summaryContent: React.ReactNode = null;
  if (!isGenericVerdict) {
    summaryContent = (
      <div className="border-l-2 border-primary/30 pl-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {overallVerdict}
        </p>
      </div>
    );
  } else if (strengths.length > 0 || weaknesses.length > 0) {
    summaryContent = (
      <div className="space-y-2 border-l-2 border-primary/30 pl-4">
        {strengths.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">✅ 优势：</span>
            <span className="text-sm text-muted-foreground">{strengths.slice(0, 3).join("；")}</span>
          </div>
        )}
        {weaknesses.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">⚠️ 风险：</span>
            <span className="text-sm text-muted-foreground">{weaknesses.slice(0, 3).join("；")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card/95 to-muted/40 border border-border/50 shadow-lg">
      {/* Subtle ambient glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/6 rounded-full blur-[60px] pointer-events-none" />
      {/* Top highlight line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-10">
        {/* Left: Score Ring */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3">研究参考分</span>
          <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
            {/* Outer glow ring */}
            <div className="absolute -inset-3 rounded-full opacity-30 blur-xl" style={{ background: `radial-gradient(circle, hsl(var(--primary) / 0.3), transparent)` }} />
            {hasScore ? <ScoreCircle score={animatedScore} customSize={120} strokeWidth={8} showText={false} /> : <div className="h-[120px] w-[120px] rounded-full border-8 border-muted" />}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-extrabold text-foreground tracking-tighter tabular-nums">{hasScore ? animatedScore : '—'}</span>
              <span className="text-[10px] text-muted-foreground font-medium">{hasScore ? '/ 100' : '尚未评分'}</span>
            </div>
          </div>
          <div className={`mt-4 text-xs font-bold px-3 py-1 rounded-full border ${label.cls}`}>
            {label.text}
          </div>
        </div>

        {/* Right: Title + Summary */}
        <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
          {displayIdea && (
            <h2 className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight tracking-tight">
              {displayIdea}
            </h2>
          )}
          {analysisStatus !== 'complete' && analysisStatus !== 'incomplete' && <p className="text-sm text-muted-foreground">本报告使用旧版研究口径，分数不能证明需求或付费成立。</p>}
          {summaryContent}
          {/* Bottom tags */}
          <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
            <span className="text-[10px] text-muted-foreground bg-muted/60 border border-border/50 rounded-full px-3 py-1">
              📊 已采集 {totalNotes} 条帖子
            </span>
            {isIncomplete && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
                ⚠ 数据未完整
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
