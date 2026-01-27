import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Flame,
  TrendingUp,
  BarChart3,
  Sparkles,
} from "lucide-react";

interface DiscoverStatsProps {
  totalTopics: number;
  avgHeatScore: number;
  topCategories: { category: string; count: number }[];
  isLoading?: boolean;
}

export function DiscoverStats({
  totalTopics,
  avgHeatScore,
  topCategories,
  isLoading,
}: DiscoverStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <GlassCard key={i} className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-16" />
          </GlassCard>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm">发现话题</span>
        </div>
        <div className="text-2xl font-bold">{totalTopics}</div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="text-sm">平均热度</span>
        </div>
        <div className="text-2xl font-bold">{avgHeatScore}°</div>
      </GlassCard>

      <GlassCard className="p-4 col-span-2">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm">热门分类</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {topCategories.length > 0 ? (
            topCategories.map(({ category, count }) => (
              <div
                key={category}
                className="flex items-center gap-1 text-sm bg-muted/50 px-2 py-1 rounded"
              >
                <span>{category}</span>
                <span className="text-xs text-muted-foreground">({count})</span>
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">暂无数据</span>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
