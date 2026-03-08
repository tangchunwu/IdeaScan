import { useState, useEffect, useRef } from "react";
import { GlassCard, ScoreCircle } from "@/components/shared";

interface ScoreHeroCardProps {
  score: number;
  totalNotes: number;
  isIncomplete?: boolean;
  idea?: string;
  overallVerdict?: string;
  strengths?: string[];
  weaknesses?: string[];
  sentiment?: { positive: number; negative: number };
}

const useCountUp = (target: number, duration = 1200) => {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || target <= 0) return;
    started.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return { text: "✅ 真实刚需", cls: "bg-green-500/10 text-green-500 border-green-500/20" };
  if (score >= 60) return { text: "⚠️ 需求待验证", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" };
  return { text: "❌ 疑似伪需求", cls: "bg-red-500/10 text-red-500 border-red-500/20" };
};

const GENERIC_VERDICTS = ["已完成综合评估", "综合评估中", "待分析"];

export const ScoreHeroCard = ({
  score,
  totalNotes,
  isIncomplete,
  idea,
  overallVerdict,
  strengths = [],
  weaknesses = [],
}: ScoreHeroCardProps) => {
  const animatedScore = useCountUp(score);
  const label = getScoreLabel(score);

  // Truncate idea title to 30 chars
  const displayIdea = idea && idea.length > 30 ? idea.slice(0, 30) + "…" : idea;

  // Build meaningful summary: prefer overallVerdict, fallback to strengths/weaknesses
  const isGenericVerdict = !overallVerdict || GENERIC_VERDICTS.includes(overallVerdict.trim());
  
  let summaryContent: React.ReactNode = null;
  if (!isGenericVerdict) {
    summaryContent = (
      <p className="text-base text-muted-foreground leading-relaxed">
        {overallVerdict}
      </p>
    );
  } else if (strengths.length > 0 || weaknesses.length > 0) {
    summaryContent = (
      <div className="space-y-2">
        {strengths.length > 0 && (
          <div>
            <span className="text-sm font-semibold text-green-500">✅ 优势：</span>
            <span className="text-base text-muted-foreground">{strengths.slice(0, 3).join("；")}</span>
          </div>
        )}
        {weaknesses.length > 0 && (
          <div>
            <span className="text-sm font-semibold text-red-500">⚠️ 风险：</span>
            <span className="text-base text-muted-foreground">{weaknesses.slice(0, 3).join("；")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <GlassCard className="relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40" padding="md" elevated>
      {/* Decorative blurs */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center gap-5 md:gap-8">
        {/* Left: Score Ring */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">需求真实度</span>
          <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
            <ScoreCircle score={animatedScore} customSize={100} strokeWidth={9} showText={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-foreground tracking-tighter">{animatedScore}</span>
              <span className="text-xs text-muted-foreground font-medium">/ 100</span>
            </div>
          </div>
          <div className={`mt-3 text-xs font-bold px-3 py-1 rounded-full border ${label.cls}`}>
            {label.text}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">基于 {totalNotes} 条数据</p>
          {isIncomplete && (
            <p className="text-xs text-amber-500 mt-1">⚠ 数据未完整</p>
          )}
        </div>

        {/* Right: Title + AI Summary */}
        <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
          {displayIdea && (
            <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight tracking-tight">
              {displayIdea}
            </h2>
          )}
          {summaryContent}
        </div>
      </div>
    </GlassCard>
  );
};
