import { DollarSign, Clock, TrendingUp, Zap } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";

interface MonetizationStrategy {
  model: string;
  timeline: string;
  revenueEstimate: string;
  description: string;
}

interface MonetizationStrategiesProps {
  strategies: MonetizationStrategy[];
}

const timelineConfig: Record<string, { label: string; icon: typeof Zap; badgeClass: string }> = {
  '短期': { label: '短期', icon: Zap, badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  '中期': { label: '中期', icon: Clock, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  '长期': { label: '长期', icon: TrendingUp, badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

function getTimelineConfig(timeline: string) {
  for (const [key, config] of Object.entries(timelineConfig)) {
    if (timeline.includes(key)) return config;
  }
  return timelineConfig['中期'];
}

export function MonetizationStrategies({ strategies }: MonetizationStrategiesProps) {
  if (!strategies || strategies.length === 0) return null;

  return (
    <div className="animate-slide-up" style={{ animationDelay: "300ms" }}>
      <GlassCard>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">变现策略建议</h3>
            <p className="text-xs text-muted-foreground">AI 推荐的商业化路径与收入潜力评估</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategies.slice(0, 4).map((strategy, i) => {
            const tlConfig = getTimelineConfig(strategy.timeline || '');
            const TimelineIcon = tlConfig.icon;
            return (
              <div
                key={i}
                className="p-4 rounded-xl bg-card/50 border border-white/5 hover:bg-card/70 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-foreground text-sm">{strategy.model}</h4>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${tlConfig.badgeClass}`}>
                    <TimelineIcon className="w-3 h-3 mr-0.5" />
                    {strategy.timeline || tlConfig.label}
                  </Badge>
                </div>

                {strategy.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{strategy.description}</p>
                )}

                {strategy.revenueEstimate && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">{strategy.revenueEstimate}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
