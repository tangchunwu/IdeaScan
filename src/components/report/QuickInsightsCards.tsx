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
    return { label: "🚀 立即启动", color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", barColor: "bg-green-500" };
  } else if (score >= 60) {
    return { label: "✅ 谨慎推进", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", barColor: "bg-yellow-500" };
  } else if (score >= 40) {
    return { label: "🔄 调整方向", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", barColor: "bg-orange-500" };
  }
  return { label: "⚠️ 暂缓执行", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", barColor: "bg-red-500" };
};

const getDemandLevel = (score: number) => {
  if (score >= 90) return { label: "强烈刚需", color: "text-green-500", pct: 95, barColor: "bg-green-500", stripFrom: "from-green-500/30", stripTo: "to-green-500/5" };
  if (score >= 70) return { label: "真实需求", color: "text-green-500", pct: 78, barColor: "bg-green-500", stripFrom: "from-green-500/30", stripTo: "to-green-500/5" };
  if (score >= 40) return { label: "需求存疑", color: "text-orange-500", pct: 50, barColor: "bg-orange-500", stripFrom: "from-orange-500/30", stripTo: "to-orange-500/5" };
  return { label: "伪需求警告", color: "text-red-500", pct: 25, barColor: "bg-red-500", stripFrom: "from-red-500/30", stripTo: "to-red-500/5" };
};

const getCompetitionInfo = (level?: string) => {
  if (!level) return { label: "数据不足", color: "text-muted-foreground", pct: 0, barColor: "bg-muted-foreground", stripFrom: "from-muted-foreground/30", stripTo: "to-muted-foreground/5" };
  if (level.includes("低") || level.includes("蓝海")) return { label: "竞争较少", color: "text-green-500", pct: 25, barColor: "bg-green-500", stripFrom: "from-green-500/30", stripTo: "to-green-500/5" };
  if (level.includes("中")) return { label: "适度竞争", color: "text-yellow-500", pct: 55, barColor: "bg-yellow-500", stripFrom: "from-yellow-500/30", stripTo: "to-yellow-500/5" };
  return { label: "竞争激烈", color: "text-red-500", pct: 85, barColor: "bg-red-500", stripFrom: "from-red-500/30", stripTo: "to-red-500/5" };
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
      barColor: demand.barColor,
      stripFrom: demand.stripFrom,
      stripTo: demand.stripTo,
      iconBg: "bg-green-500/10",
    },
    {
      icon: Swords,
      title: "竞争激烈度",
      value: competition.label,
      score: competitionLevel || "—",
      color: competition.color,
      barPct: competition.pct,
      barColor: competition.barColor,
      stripFrom: competition.stripFrom,
      stripTo: competition.stripTo,
      iconBg: "bg-blue-500/10",
    },
    {
      icon: Rocket,
      title: "行动建议",
      value: verdict.label,
      score: `${strengths.length} 优势 / ${weaknesses.length} 风险`,
      color: verdict.color,
      barPct: score,
      barColor: verdict.barColor,
      stripFrom: verdict.color.includes("green") ? "from-green-500/30" : verdict.color.includes("yellow") ? "from-yellow-500/30" : verdict.color.includes("orange") ? "from-orange-500/30" : "from-red-500/30",
      stripTo: verdict.color.includes("green") ? "to-green-500/5" : verdict.color.includes("yellow") ? "to-yellow-500/5" : verdict.color.includes("orange") ? "to-orange-500/5" : "to-red-500/5",
      iconBg: "bg-purple-500/10",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 animate-slide-up" style={{ animationDelay: "120ms" }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Tooltip key={card.title}>
              <TooltipTrigger asChild>
                <div className="relative rounded-2xl bg-card/60 backdrop-blur-sm border border-border/40 border-l-[3px] border-l-primary shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-default overflow-hidden">
                  {/* Top color strip */}
                  <div className={`h-[2px] bg-gradient-to-r ${card.stripFrom} ${card.stripTo}`} />
                  <div className="p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`w-7 h-7 rounded-full ${card.iconBg} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${card.color}`} />
                      </div>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{card.title}</span>
                    </div>
                    <div className={`text-2xl font-bold mb-1 ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-muted-foreground mb-3">{card.score}</div>
                    <AnimatedBar pct={card.barPct} barColor={card.barColor} />
                  </div>
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
