import { useState, useEffect, useRef } from "react";
import { GlassCard, ScoreCircle } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Rocket, CheckCircle, TrendingUp, XCircle } from "lucide-react";

interface ScoreHeroCardProps {
  score: number;
  totalNotes: number;
  isIncomplete?: boolean;
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

const getScoreInterpretation = (score: number) => {
  if (score >= 90) return "🏆 超过 95% 的同类创意";
  if (score >= 80) return "🎯 超过 78% 的同类创意";
  if (score >= 70) return "📈 表现优于多数创意";
  if (score >= 60) return "⚖️ 需求信号尚可，建议深挖";
  if (score >= 40) return "🔍 信号较弱，建议调整方向";
  return "⚠️ 建议重新审视需求假设";
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
  strengths = [],
  weaknesses = [],
  sentiment = { positive: 0, negative: 0 },
  onValidateMore,
  onStartBuilding,
}: ScoreHeroCardProps) => {
  const animatedScore = useCountUp(score);

  const verdict = getVerdict(score, strengths, weaknesses, sentiment);
  const config = verdictConfig[verdict];

  const handleAction = (action: string) => {
    if (action === "validate" && onValidateMore) onValidateMore();
    else if (action === "build" && onStartBuilding) onStartBuilding();
    else if (action === "pivot") window.location.href = "/discover";
  };

  return (
    <GlassCard className="h-full flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40 min-h-[240px] sm:min-h-[280px]" padding="lg" elevated>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
      <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">需求真实度评分</span>
      <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
        <ScoreCircle score={animatedScore} customSize={160} strokeWidth={12} showText={false} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-foreground tracking-tighter">{animatedScore}</span>
          <span className="text-sm text-muted-foreground mt-1 font-medium">/ 100</span>
        </div>
      </div>
      <div className="mt-5 text-center space-y-2">
        <div className={`text-lg font-bold px-6 py-2 rounded-full inline-block ${score >= 80 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
          score >= 60 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
          {score >= 80 ? "✅ 真实刚需" : score >= 60 ? "⚠️ 需求待验证" : "❌ 疑似伪需求"}
        </div>
        <p className="text-sm text-muted-foreground mt-2">基于 {totalNotes} 条真实用户数据分析</p>
        <p className="text-sm text-muted-foreground/70">{getScoreInterpretation(score)}</p>
        {isIncomplete && (
          <p className="text-xs text-amber-500 mt-1">⚠ 数据采集未完成，评分可能不准确</p>
        )}
      </div>

      {/* Merged Action Recommendation */}
      <div className="w-full mt-5 pt-4 border-t border-border/40">
        <p className={`text-sm font-bold ${config.color} text-center mb-1`}>{config.title}</p>
        <div className="flex justify-center gap-2 mt-3">
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
    </GlassCard>
  );
};
