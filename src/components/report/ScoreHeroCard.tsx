import { useState, useEffect, useRef } from "react";
import { ScoreCircle } from "@/components/shared";

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
  if (score >= 80) return { text: "✅ 真实刚需", cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25" };
  if (score >= 60) return { text: "⚠️ 需求待验证", cls: "bg-amber-400/15 text-amber-300 border-amber-400/25" };
  return { text: "❌ 疑似伪需求", cls: "bg-red-400/15 text-red-300 border-red-400/25" };
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

  const displayIdea = idea && idea.length > 30 ? idea.slice(0, 30) + "…" : idea;

  const isGenericVerdict = !overallVerdict || GENERIC_VERDICTS.includes(overallVerdict.trim());

  let summaryContent: React.ReactNode = null;
  if (!isGenericVerdict) {
    summaryContent = (
      <div className="border-l-2 border-white/20 pl-4">
        <p className="text-sm text-slate-300 leading-relaxed">
          {overallVerdict}
        </p>
      </div>
    );
  } else if (strengths.length > 0 || weaknesses.length > 0) {
    summaryContent = (
      <div className="space-y-2 border-l-2 border-white/20 pl-4">
        {strengths.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-emerald-400">✅ 优势：</span>
            <span className="text-sm text-slate-300">{strengths.slice(0, 3).join("；")}</span>
          </div>
        )}
        {weaknesses.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-red-400">⚠️ 风险：</span>
            <span className="text-sm text-slate-300">{weaknesses.slice(0, 3).join("；")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/[0.08] shadow-2xl">
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-secondary/10 rounded-full blur-[80px] pointer-events-none" />
      {/* Top highlight */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-10">
        {/* Left: Score Ring */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">需求真实度</span>
          <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
            {/* Outer glow ring */}
            <div className="absolute -inset-3 rounded-full opacity-40 blur-xl" style={{ background: `radial-gradient(circle, hsl(var(--primary) / 0.4), transparent)` }} />
            <ScoreCircle score={animatedScore} customSize={120} strokeWidth={8} showText={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-extrabold text-white tracking-tighter tabular-nums">{animatedScore}</span>
              <span className="text-[10px] text-slate-400 font-medium">/ 100</span>
            </div>
          </div>
          <div className={`mt-4 text-xs font-bold px-3 py-1 rounded-full border ${label.cls}`}>
            {label.text}
          </div>
        </div>

        {/* Right: Title + Summary */}
        <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
          {displayIdea && (
            <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-tight">
              {displayIdea}
            </h2>
          )}
          {summaryContent}
          {/* Bottom tags */}
          <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
            <span className="text-[10px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              📊 基于 {totalNotes} 条数据
            </span>
            {isIncomplete && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
                ⚠ 数据未完整
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
