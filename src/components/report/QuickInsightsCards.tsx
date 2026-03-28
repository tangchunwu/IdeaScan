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
    return { label: "🚀 立即启动", color: "text-emerald-500", hoverBorder: "hover:border-emerald-500/30", barColor: "bg-emerald-500", gradFrom: "from-emerald-500/8", gradTo: "to-transparent" };
  } else if (score >= 60) {
    return { label: "✅ 谨慎推进", color: "text-amber-500", hoverBorder: "hover:border-amber-500/30", barColor: "bg-amber-500", gradFrom: "from-amber-500/8", gradTo: "to-transparent" };
  } else if (score >= 40) {
    return { label: "🔄 调整方向", color: "text-orange-500", hoverBorder: "hover:border-orange-500/30", barColor: "bg-orange-500", gradFrom: "from-orange-500/8", gradTo: "to-transparent" };
  }
  return { label: "⚠️ 暂缓执行", color: "text-red-500", hoverBorder: "hover:border-red-500/30", barColor: "bg-red-500", gradFrom: "from-red-500/8", gradTo: "to-transparent" };
};

const getDemandLevel = (score: number) => {
  if (score >= 90) return { label: "强烈刚需", color: "text-emerald-500", pct: 95, barColor: "bg-emerald-500", hoverBorder: "hover:border-emerald-500/30", gradFrom: "from-emerald-500/8", gradTo: "to-transparent" };
  if (score >= 70) return { label: "真实需求", color: "text-emerald-500", pct: 78, barColor: "bg-emerald-500", hoverBorder: "hover:border-emerald-500/30", gradFrom: "from-emerald-500/8", gradTo: "to-transparent" };
  if (score >= 40) return { label: "需求存疑", color: "text-orange-500", pct: 50, barColor: "bg-orange-500", hoverBorder: "hover:border-orange-500/30", gradFrom: "from-orange-500/8", gradTo: "to-transparent" };
  return { label: "伪需求警告", color: "text-red-500", pct: 25, barColor: "bg-red-500", hoverBorder: "hover:border-red-500/30", gradFrom: "from-red-500/8", gradTo: "to-transparent" };
};

const getCompetitionInfo = (level?: string) => {
  if (!level) return { label: "数据不足", color: "text-muted-foreground", pct: 0, barColor: "bg-muted-foreground", hoverBorder: "hover:border-muted-foreground/30", gradFrom: "from-muted-foreground/5", gradTo: "to-transparent" };
  if (level.includes("低") || level.includes("蓝海")) return { label: "竞争较少", color: "text-emerald-500", pct: 25, barColor: "bg-emerald-500", hoverBorder: "hover:border-emerald-500/30", gradFrom: "from-emerald-500/8", gradTo: "to-transparent" };
  if (level.includes("中")) return { label: "适度竞争", color: "text-amber-500", pct: 55, barColor: "bg-amber-500", hoverBorder: "hover:border-amber-500/30", gradFrom: "from-amber-500/8", gradTo: "to-transparent" };
  return { label: "竞争激烈", color: "text-red-500", pct: 85, barColor: "bg-red-500", hoverBorder: "hover:border-red-500/30", gradFrom: "from-red-500/8", gradTo: "to-transparent" };
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
    <div ref={ref} className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
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
      hoverBorder: demand.hoverBorder,
      gradFrom: demand.gradFrom,
      gradTo: demand.gradTo,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      icon: Swords,
      title: "竞争激烈度",
      value: competition.label,
      score: competitionLevel || "—",
      color: competition.color,
      barPct: competition.pct,
      barColor: competition.barColor,
      hoverBorder: competition.hoverBorder,
      gradFrom: competition.gradFrom,
      gradTo: competition.gradTo,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      icon: Rocket,
      title: "行动建议",
      value: verdict.label,
      score: `${strengths.length} 优势 / ${weaknesses.length} 风险`,
      color: verdict.color,
      barPct: score,
      barColor: verdict.barColor,
      hoverBorder: verdict.hoverBorder,
      gradFrom: verdict.gradFrom,
      gradTo: verdict.gradTo,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-500",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Tooltip key={card.title}>
              <TooltipTrigger asChild>
                <div className={`relative rounded-2xl bg-card/70 backdrop-blur-sm border border-border/40 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-default overflow-hidden ${card.hoverBorder}`}>
                  {/* Bottom gradient tint */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${card.gradFrom} ${card.gradTo} pointer-events-none`} />
                  {/* Top highlight */}
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="relative p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${card.iconColor}`} />
                      </div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{card.title}</span>
                    </div>
                    <div className={`text-3xl font-extrabold mb-1 tabular-nums ${card.color}`}>{card.value}</div>
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
