import { useState, useEffect, useRef } from "react";
import { GlassCard, ScoreCircle } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Rocket, CheckCircle, TrendingUp, XCircle } from "lucide-react";

interface ScoreHeroCardProps {
  score: number;
  totalNotes: number;
  isIncomplete?: boolean;
  idea?: string;
  overallVerdict?: string;
  strengths?: string[];
  weaknesses?: string[];
  sentiment?: { positive: number; negative: number };
  onValidateMore?: () => void;
  onStartBuilding?: () => void;
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

type VerdictType = "strong_go" | "conditional_go" | "pivot" | "stop";

const getVerdict = (
  score: number,
  strengths: string[],
  weaknesses: string[],
  sentiment: { positive: number; negative: number }
): VerdictType => {
  const sentimentRatio = sentiment.positive / (sentiment.positive + sentiment.negative + 1);
  if (score >= 75 && strengths.length >= 2 && sentimentRatio > 0.5) return "strong_go";
  if (score >= 60 && strengths.length >= 1) return "conditional_go";
  if (score >= 40 && weaknesses.length <= 3) return "pivot";
  return "stop";
};

const verdictConfig: Record<VerdictType, {
  title: string;
  icon: React.ReactNode;
  color: string;
  actions: { label: string; primary: boolean; action: "validate" | "build" | "pivot" | "stop" }[];
}> = {
  strong_go: {
    title: "🚀 建议：立即启动！",
    icon: <Rocket className="w-4 h-4" />,
    color: "text-green-500",
    actions: [
      { label: "开始构建 MVP", primary: true, action: "build" },
      { label: "深度验证", primary: false, action: "validate" },
    ],
  },
  conditional_go: {
    title: "✅ 建议：谨慎推进",
    icon: <CheckCircle className="w-4 h-4" />,
    color: "text-yellow-500",
    actions: [
      { label: "小规模测试", primary: true, action: "validate" },
      { label: "查看风险", primary: false, action: "pivot" },
    ],
  },
  pivot: {
    title: "🔄 建议：调整方向",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "text-orange-500",
    actions: [
      { label: "探索热点", primary: true, action: "pivot" },
      { label: "对比想法", primary: false, action: "validate" },
    ],
  },
  stop: {
    title: "⚠️ 建议：暂缓执行",
    icon: <XCircle className="w-4 h-4" />,
    color: "text-red-500",
    actions: [
      { label: "发现机会", primary: true, action: "pivot" },
      { label: "重新验证", primary: false, action: "validate" },
    ],
  },
};

export const ScoreHeroCard = ({
  score,
  totalNotes,
  isIncomplete,
  idea,
  overallVerdict,
  strengths = [],
  weaknesses = [],
  sentiment = { positive: 0, negative: 0 },
  onValidateMore,
  onStartBuilding,
}: ScoreHeroCardProps) => {
  const animatedScore = useCountUp(score);
  const verdict = getVerdict(score, strengths, weaknesses, sentiment);
  const config = verdictConfig[verdict];
  const label = getScoreLabel(score);

  const handleAction = (action: string) => {
    if (action === "validate" && onValidateMore) onValidateMore();
    else if (action === "build" && onStartBuilding) onStartBuilding();
    else if (action === "pivot") window.location.href = "/discover";
  };

  return (
    <GlassCard className="relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40" padding="lg" elevated>
      {/* Decorative blurs */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
        {/* Left: Score Ring */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">需求真实度</span>
          <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
            <ScoreCircle score={animatedScore} customSize={120} strokeWidth={10} showText={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-foreground tracking-tighter">{animatedScore}</span>
              <span className="text-[10px] text-muted-foreground font-medium">/ 100</span>
            </div>
          </div>
          <div className={`mt-3 text-xs font-bold px-3 py-1 rounded-full border ${label.cls}`}>
            {label.text}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">基于 {totalNotes} 条数据</p>
          {isIncomplete && (
            <p className="text-[10px] text-amber-500 mt-1">⚠ 数据未完整</p>
          )}
        </div>

        {/* Right: Elevator Pitch */}
        <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
          {idea && (
            <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight tracking-tight line-clamp-2">
              {idea}
            </h2>
          )}
          {overallVerdict && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
              {overallVerdict}
            </p>
          )}

          {/* Verdict + Actions */}
          <div className="pt-2 border-t border-border/30">
            <p className={`text-sm font-bold ${config.color} mb-2`}>{config.title}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              {config.actions.map((action, i) => (
                <Button
                  key={i}
                  variant={action.primary ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleAction(action.action)}
                  className="rounded-full text-xs"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
