import { CheckCircle, TrendingUp, XCircle, Rocket } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
  bgColor: string;
  borderColor: string;
  actions: { label: string; primary: boolean; action: "validate" | "build" | "pivot" | "stop" }[];
}> = {
  strong_go: {
    title: "🚀 建议：立即启动！",
    subtitle: "数据强烈支持这个想法，市场需求明确",
    icon: <Rocket className="w-6 h-6" />,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    actions: [
      { label: "开始构建 MVP", primary: true, action: "build" },
      { label: "深度验证更多数据", primary: false, action: "validate" },
    ],
  },
  conditional_go: {
    title: "✅ 建议：谨慎推进",
    subtitle: "数据整体积极，但建议先解决关键风险再全力投入",
    icon: <CheckCircle className="w-6 h-6" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    actions: [
      { label: "先做小规模测试", primary: true, action: "validate" },
      { label: "查看风险详情", primary: false, action: "pivot" },
    ],
  },
  pivot: {
    title: "🔄 建议：调整方向",
    subtitle: "核心想法有价值，但当前形态需要优化",
    icon: <TrendingUp className="w-6 h-6" />,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    actions: [
      { label: "探索相关热点", primary: true, action: "pivot" },
      { label: "对比其他想法", primary: false, action: "validate" },
    ],
  },
  stop: {
    title: "⚠️ 建议：暂缓执行",
    subtitle: "当前数据不支持这个方向，建议重新调研",
    icon: <XCircle className="w-6 h-6" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    actions: [
      { label: "发现其他机会", primary: true, action: "pivot" },
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
    <GlassCard className={`p-6 border-2 ${config.borderColor} ${config.bgColor}`}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className={`p-3 rounded-xl ${config.bgColor} ${config.color}`}>
          {config.icon}
        </div>
        <div className="flex-1">
          <h3 className={`text-xl font-bold ${config.color}`}>{config.title}</h3>
          <p className="text-muted-foreground text-sm mt-1">{config.subtitle}</p>
        </div>
      </div>

      {/* Decision Confidence Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-muted-foreground">决策置信度</span>
          <span className={config.color}>{score >= 70 ? "高" : score >= 50 ? "中" : "低"}</span>
        </div>
        <Progress value={score} className="h-2" />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {config.actions.map((action, i) => (
          <Button
            key={i}
            variant={action.primary ? "default" : "outline"}
            onClick={() => handleAction(action.action)}
            className={action.primary ? "flex-1" : ""}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </GlassCard>
  );
};

export default ActionRecommendation;
