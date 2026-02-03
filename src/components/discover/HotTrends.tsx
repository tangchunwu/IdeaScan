import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Flame, ArrowUpRight, BarChart3, Sparkles, Target } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { getHotTrends, TrendingTopic, trackTopicClick } from "@/services/discoverService";

interface HotTrendsProps {
  limit?: number;
  showTitle?: boolean;
  className?: string;
}

export const HotTrends = ({
  limit = 5,
  showTitle = true,
  className = "",
}: HotTrendsProps) => {
  const navigate = useNavigate();

  const { data: trends, isLoading } = useQuery({
    queryKey: ["hot-trends", limit],
    queryFn: () => getHotTrends(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleClick = async (trend: TrendingTopic) => {
    // Track click
    await trackTopicClick(trend.id, trend.keyword, 'validate');
    // Navigate to validate page with pre-filled keyword
    navigate(`/validate?idea=${encodeURIComponent(trend.keyword)}`);
  };

  const formatGrowthRate = (rate: number | null) => {
    if (rate === null || rate === undefined) return null;
    const formatted = rate > 0 ? `+${rate.toFixed(0)}%` : `${rate.toFixed(0)}%`;
    return formatted;
  };

  const getGrowthColor = (rate: number | null) => {
    if (rate === null || rate === undefined) return "text-muted-foreground";
    if (rate >= 20) return "text-green-500";
    if (rate >= 0) return "text-yellow-500";
    return "text-red-500";
  };

  const getRankStyle = (index: number) => {
    if (index === 0) return "bg-yellow-500/20 text-yellow-500";
    if (index === 1) return "bg-gray-400/20 text-gray-400";
    if (index === 2) return "bg-orange-600/20 text-orange-600";
    return "bg-muted text-muted-foreground";
  };

  if (isLoading) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        {showTitle && (
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="w-32 h-6" />
          </div>
        )}
        <div className="space-y-3">
          {[...Array(limit)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        {showTitle && (
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold">本周热门趋势</h3>
          </div>
        )}
        <div className="text-center py-8 text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无热门趋势，稍后再来查看</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
            <h3 className="font-semibold">本周热门趋势</h3>
            <Badge variant="secondary" className="text-xs">
              Top {limit}
            </Badge>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {trends.map((trend, index) => (
          <div
            key={trend.id}
            onClick={() => handleClick(trend)}
            className="flex items-center gap-4 p-4 rounded-xl bg-card/50 hover:bg-card/80 border border-transparent hover:border-primary/20 transition-all cursor-pointer group"
          >
            {/* Rank Badge */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(index)}`}>
              {index + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {trend.keyword}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-400" />
                  热度 {trend.heat_score}
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  {trend.sample_count} 样本
                </span>
                {trend.category && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {trend.category}
                  </Badge>
                )}
              </div>
            </div>

            {/* Growth Rate */}
            <div className="text-right">
              {trend.growth_rate !== null && (
                <div className={`text-lg font-bold flex items-center gap-1 ${getGrowthColor(trend.growth_rate)}`}>
                  {trend.growth_rate > 0 && <ArrowUpRight className="w-4 h-4" />}
                  {formatGrowthRate(trend.growth_rate)}
                </div>
              )}
              {trend.quality_score !== undefined && trend.quality_score !== null && (
                <div className="text-[10px] text-muted-foreground">
                  质量分 {trend.quality_score}
                </div>
              )}
            </div>

            {/* Validate Button */}
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Target className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button
        variant="outline"
        className="w-full mt-4"
        onClick={() => navigate("/discover")}
      >
        <TrendingUp className="w-4 h-4 mr-2" />
        发现更多趋势
      </Button>
    </GlassCard>
  );
};

export default HotTrends;
