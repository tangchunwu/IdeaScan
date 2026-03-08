import { useEffect, useRef, useState } from "react";
import { TrendingUp, Swords, Rocket } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const tooltips: Record<string, string> = {
  "需求真实度": "基于用户讨论量、情感倾向和痛点强度综合评估的需求真实性指标",
  "竞争激烈度": "分析现有市场参与者数量、融资情况和市场占有率得出的竞争程度",
  "行动建议": "综合需求强度、竞争态势和优劣势分析后给出的决策建议",
};

const AnimatedBar = ({ pct, barColor }: { pct: number; barColor: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div
        className={`h-full rounded-full ${barColor} transition-all duration-1000 ease-out`}
        style={{ width: visible ? `${pct}%` : "0%" }}
      />
    </div>
  );
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
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 sm:mb-8 animate-slide-up" style={{ animationDelay: "120ms" }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Tooltip key={card.title}>
              <TooltipTrigger asChild>
                <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/40 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-default">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-4 h-4 ${card.color}`} />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{card.title}</span>
                  </div>
                  <div className={`text-xl font-bold mb-1 ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-muted-foreground mb-3">{card.score}</div>
                  <AnimatedBar pct={card.barPct} barColor={card.barColor} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                {tooltips[card.title]}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
