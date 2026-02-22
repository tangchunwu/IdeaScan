import {
  PieChart, Pie, Cell, ResponsiveContainer, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { Activity, PieChartIcon, TrendingUp, Heart, Bookmark, MessageCircle, Users, Target } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { CustomTooltip } from "./CustomTooltip";
import type { ReportDataResult } from "./useReportData";

const CONTENT_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

interface OverviewTabProps {
  data: ReportDataResult;
}

export function OverviewTab({ data }: OverviewTabProps) {
  const { xiaohongshuData, dimensions, marketAnalysis } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <GlassCard className="animate-slide-up">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            一周热度趋势
          </h3>
          <div className="h-64">
            {xiaohongshuData.weeklyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={xiaohongshuData.weeklyTrend}>
                  <defs>
                    <linearGradient id="overviewGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#overviewGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">暂无趋势数据</div>
            )}
          </div>
        </GlassCard>

        {/* Radar Chart */}
        <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-secondary" />
            多维度评分
          </h3>
          <div className="h-64">
            {dimensions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={dimensions}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="dimension" stroke="hsl(var(--muted-foreground))" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                  <Radar name="评分" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">暂无维度数据</div>
            )}
          </div>
        </GlassCard>
      </div>

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
            <TrendingUp className="w-5 h-5 text-ghibli-forest" />
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
