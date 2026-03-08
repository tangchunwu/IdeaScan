import { CheckCircle, TrendingUp, XCircle, Rocket } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";

interface ActionRecommendationProps {
  score: number;
  strengths: string[];
  weaknesses: string[];
  sentiment: {
    positive: number;
    negative: number;
  };
  onValidateMore?: () => void;
  onStartBuilding?: () => void;
}

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
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  stripColor: string;
  actions: { label: string; primary: boolean; action: "validate" | "build" | "pivot" | "stop" }[];
}> = {
  strong_go: {
    title: "🚀 建议：立即启动！",
    subtitle: "数据强烈支持这个想法，市场需求明确",
    icon: <Rocket className="w-5 h-5" />,
    color: "text-green-500",
    stripColor: "bg-green-500",
    actions: [
      { label: "开始构建 MVP", primary: true, action: "build" },
      { label: "深度验证", primary: false, action: "validate" },
    ],
  },
  conditional_go: {
    title: "✅ 建议：谨慎推进",
    subtitle: "数据整体积极，但建议先解决关键风险再全力投入",
    icon: <CheckCircle className="w-5 h-5" />,
    color: "text-yellow-500",
    stripColor: "bg-yellow-500",
    actions: [
      { label: "小规模测试", primary: true, action: "validate" },
      { label: "查看风险", primary: false, action: "pivot" },
    ],
  },
  pivot: {
    title: "🔄 建议：调整方向",
    subtitle: "核心想法有价值，但当前形态需要优化",
    icon: <TrendingUp className="w-5 h-5" />,
    color: "text-orange-500",
    stripColor: "bg-orange-500",
    actions: [
      { label: "探索热点", primary: true, action: "pivot" },
      { label: "对比想法", primary: false, action: "validate" },
    ],
  },
  stop: {
    title: "⚠️ 建议：暂缓执行",
    subtitle: "当前数据不支持这个方向，建议重新调研",
    icon: <XCircle className="w-5 h-5" />,
    color: "text-red-500",
    stripColor: "bg-red-500",
    actions: [
      { label: "发现机会", primary: true, action: "pivot" },
      { label: "重新验证", primary: false, action: "validate" },
    ],
  },
};

export const ActionRecommendation = ({
  score,
  strengths,
  weaknesses,
  sentiment,
  onValidateMore,
  onStartBuilding,
}: ActionRecommendationProps) => {
  const verdict = getVerdict(score, strengths, weaknesses, sentiment);
  const config = verdictConfig[verdict];

  const handleAction = (action: string) => {
    if (action === "validate" && onValidateMore) onValidateMore();
    else if (action === "build" && onStartBuilding) onStartBuilding();
    else if (action === "pivot") window.location.href = "/discover";
  };

  return (
    <GlassCard className="overflow-hidden h-full" padding="none">
      {/* Left color strip via border */}
      <div className="flex h-full">
        <div className={`w-1 ${config.stripColor} flex-shrink-0`} />
        <div className="flex-1 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-lg bg-card border border-border/50 ${config.color}`}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`text-lg font-bold ${config.color}`}>{config.title}</h3>
              <p className="text-muted-foreground text-sm mt-0.5">{config.subtitle}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {config.actions.map((action, i) => (
              <Button
                key={i}
                variant={action.primary ? "default" : "outline"}
                size="sm"
                onClick={() => handleAction(action.action)}
                className="rounded-full"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

export default ActionRecommendation;
