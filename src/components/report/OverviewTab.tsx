import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PieChartIcon, TrendingUp, Heart, Bookmark, MessageCircle, Users } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { CustomTooltip } from "./CustomTooltip";
import { TrendTimelineChart } from "./TrendTimelineChart";
import type { ReportDataResult } from "./useReportData";

const CONTENT_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

interface OverviewTabProps {
  data: ReportDataResult;
}

export function OverviewTab({ data }: OverviewTabProps) {
  const { xiaohongshuData, marketAnalysis } = data;

  // Build trend timeline data from weeklyTrend
  const trendTimelineData = xiaohongshuData.weeklyTrend.map((item: any, i: number) => {
    const now = new Date();
    const date = new Date(now.getTime() - (xiaohongshuData.weeklyTrend.length - 1 - i) * 24 * 60 * 60 * 1000);
    return { date: date.toISOString().split("T")[0], value: item.value, label: item.name };
  });

  return (
    <div className="space-y-6">
      {/* Trend Timeline Chart */}
      {trendTimelineData.length > 0 && (
        <TrendTimelineChart data={trendTimelineData} title="关键词热度趋势" />
      )}

      {/* Content Type Distribution + Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-accent" />
            内容类型分布
          </h3>
          <div className="h-64 flex items-center">
            {xiaohongshuData.contentTypes.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={xiaohongshuData.contentTypes} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {xiaohongshuData.contentTypes.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={CONTENT_COLORS[index % CONTENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {xiaohongshuData.contentTypes.map((item: any, index: number) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CONTENT_COLORS[index % CONTENT_COLORS.length] }} />
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-medium text-foreground">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">暂无内容类型数据</div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            关键指标
          </h3>
          <div className="space-y-4">
            {[
              { label: "总互动量", value: xiaohongshuData.totalEngagement.toLocaleString(), icon: Heart, color: "text-destructive" },
              { label: "平均收藏", value: xiaohongshuData.avgCollects, icon: Bookmark, color: "text-accent" },
              { label: "平均评论", value: xiaohongshuData.avgComments, icon: MessageCircle, color: "text-primary" },
              { label: "目标用户", value: marketAnalysis.targetAudience?.split("、")[0] || "未知", icon: Users, color: "text-secondary" },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                    <span className="text-muted-foreground">{metric.label}</span>
                  </div>
                  <span className="font-semibold text-foreground">{metric.value}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
