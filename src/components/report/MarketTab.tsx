import { Target, Users, TrendingUp, Activity } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import type { ReportDataResult } from "./useReportData";

interface MarketTabProps {
  data: ReportDataResult;
}

export function MarketTab({ data }: MarketTabProps) {
  const { marketAnalysis } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "市场规模", value: marketAnalysis.marketSize, icon: Target },
          { label: "竞争程度", value: marketAnalysis.competitionLevel, icon: Users },
          { label: "趋势方向", value: marketAnalysis.trendDirection, icon: TrendingUp },
          { label: "热度评级", value: "高", icon: Activity },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <GlassCard key={item.label} className="text-center animate-slide-up">
              <Icon className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-xl font-bold text-foreground">{item.value}</div>
              <div className="text-sm text-muted-foreground">{item.label}</div>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
        <h3 className="text-lg font-semibold text-foreground mb-4">目标用户画像</h3>
        <p className="text-muted-foreground leading-relaxed">{marketAnalysis.targetAudience}</p>
      </GlassCard>

      <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
        <h3 className="text-lg font-semibold text-foreground mb-4">热门关键词</h3>
        <div className="flex flex-wrap gap-2">
          {(marketAnalysis.keywords || []).map((keyword: string) => (
            <Badge key={keyword} variant="secondary" className="px-4 py-2 text-sm bg-primary/10 text-primary">
              {keyword}
            </Badge>
          ))}
          {(!marketAnalysis.keywords || marketAnalysis.keywords.length === 0) && (
            <span className="text-muted-foreground">暂无关键词数据</span>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
