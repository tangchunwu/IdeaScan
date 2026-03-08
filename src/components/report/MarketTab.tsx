import { Target, Users } from "lucide-react";
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "市场规模", value: marketAnalysis.marketSize, icon: Target },
          { label: "竞争程度", value: marketAnalysis.competitionLevel, icon: Users },
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
        {(marketAnalysis.keywords?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
            {marketAnalysis.keywords.map((keyword: string) => (
              <Badge key={keyword} variant="secondary" className="px-4 py-2 text-sm bg-primary/10 text-primary">
                {keyword}
              </Badge>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
