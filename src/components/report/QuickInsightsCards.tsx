import { TrendingUp, Swords, Rocket } from "lucide-react";

interface QuickInsightsCardsProps {
  score: number;
  competitionLevel?: string;
  overallVerdict?: string;
  strengths?: string[];
  weaknesses?: string[];
  sentimentPositive: number;
}

const getVerdictInfo = (score: number, strengths: string[], weaknesses: string[], sentimentPositive: number) => {
  if (score >= 75 && strengths.length >= 2 && sentimentPositive > 50) {
    return { label: "🚀 立即启动", color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20" };
  } else if (score >= 60) {
    return { label: "✅ 谨慎推进", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
  } else if (score >= 40) {
    return { label: "🔄 调整方向", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" };
  }
  return { label: "⚠️ 暂缓执行", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" };
};

const getDemandLevel = (score: number) => {
  if (score >= 90) return { label: "强烈刚需", color: "text-green-500", pct: 95 };
  if (score >= 70) return { label: "真实需求", color: "text-green-500", pct: 78 };
  if (score >= 40) return { label: "需求存疑", color: "text-orange-500", pct: 50 };
  return { label: "伪需求警告", color: "text-red-500", pct: 25 };
};

const getCompetitionInfo = (level?: string) => {
  if (!level) return { label: "数据不足", color: "text-muted-foreground", pct: 0 };
  if (level.includes("低") || level.includes("蓝海")) return { label: "竞争较少", color: "text-green-500", pct: 25 };
  if (level.includes("中")) return { label: "适度竞争", color: "text-yellow-500", pct: 55 };
  return { label: "竞争激烈", color: "text-red-500", pct: 85 };
};

export const QuickInsightsCards = ({ score, competitionLevel, strengths = [], weaknesses = [], sentimentPositive }: QuickInsightsCardsProps) => {
  const demand = getDemandLevel(score);
  const competition = getCompetitionInfo(competitionLevel);
  const verdict = getVerdictInfo(score, strengths, weaknesses, sentimentPositive);

  const cards = [
    {
      icon: TrendingUp,
      title: "需求真实度",
      value: demand.label,
      score: `${score}/100`,
      color: demand.color,
      barPct: demand.pct,
      barColor: demand.color.replace("text-", "bg-"),
    },
    {
      icon: Swords,
      title: "竞争激烈度",
      value: competition.label,
      score: competitionLevel || "—",
      color: competition.color,
      barPct: competition.pct,
      barColor: competition.color.replace("text-", "bg-"),
    },
    {
      icon: Rocket,
      title: "行动建议",
      value: verdict.label,
      score: `${strengths.length} 优势 / ${weaknesses.length} 风险`,
      color: verdict.color,
      barPct: score,
      barColor: verdict.color.replace("text-", "bg-"),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 sm:mb-8 animate-slide-up" style={{ animationDelay: "120ms" }}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/40 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{card.title}</span>
            </div>
            <div className={`text-xl font-bold mb-1 ${card.color}`}>{card.value}</div>
            <div className="text-xs text-muted-foreground mb-3">{card.score}</div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${card.barColor} transition-all duration-700`}
                style={{ width: `${card.barPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
