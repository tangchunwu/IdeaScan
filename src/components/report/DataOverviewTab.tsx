import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import { Heart, Bookmark, MessageCircle, Database } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CustomTooltip } from "./CustomTooltip";
import { TrendTimelineChart } from "./TrendTimelineChart";
import { DemandDecisionCard } from "./DemandDecisionCard";
import { SectionHeading } from "./SectionHeading";
import type { ReportDataResult } from "./useReportData";

const CONTENT_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

const typeLabels: Record<string, { label: string; color: string }> = {
  complaint: { label: "吐槽", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  question: { label: "求助", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  recommendation: { label: "推荐", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  comparison: { label: "比较", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
};

interface DataOverviewTabProps {
  data: ReportDataResult;
  dataSummary?: any;
  dataQualityScore?: number;
  keywordsUsed?: {
    coreKeywords?: string[];
    userPhrases?: string[];
    competitorQueries?: string[];
    trendKeywords?: string[];
  };
  demandDecisionProps?: any;
}

export function DataOverviewTab({ data, dataSummary, dataQualityScore, keywordsUsed, demandDecisionProps }: DataOverviewTabProps) {
  const { xiaohongshuData } = data;

  const trendTimelineData = xiaohongshuData.weeklyTrend.map((item: any, i: number) => {
    const now = new Date();
    const date = new Date(now.getTime() - (xiaohongshuData.weeklyTrend.length - 1 - i) * 24 * 60 * 60 * 1000);
    return { date: date.toISOString().split("T")[0], value: item.value, label: item.name };
  });

  const hasInsightsData = dataSummary && (dataQualityScore || 0) > 0;

  return (
    <div className="space-y-5">
      {/* Demand Decision Card */}
      {demandDecisionProps && <DemandDecisionCard {...demandDecisionProps} />}

      {/* Trend Timeline Chart */}
      {trendTimelineData.length > 0 && (
        <TrendTimelineChart data={trendTimelineData} title="关键词热度趋势" />
      )}

      {/* Content Type Distribution + Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
          <SectionHeading emoji="📊" title="内容类型分布" />
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
          <SectionHeading emoji="📈" title="关键指标" />
          </h3>
          <div className="space-y-4">
            {[
              { label: "总互动量", value: xiaohongshuData.totalEngagement.toLocaleString(), icon: Heart, color: "text-destructive" },
              { label: "平均收藏", value: xiaohongshuData.avgCollects, icon: Bookmark, color: "text-accent" },
              { label: "平均评论", value: xiaohongshuData.avgComments, icon: MessageCircle, color: "text-primary" },
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

      {/* Data Quality Score */}
      {hasInsightsData && (
        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-4">
            <SectionHeading emoji="⚡" title="数据质量评分" className="mb-0" />
            </h3>
            <Badge variant="outline" className={
              (dataQualityScore || 0) >= 70 ? "border-green-500/50 text-green-500" :
                (dataQualityScore || 0) >= 40 ? "border-yellow-500/50 text-yellow-500" :
                  "border-red-500/50 text-red-500"
            }>
              {dataQualityScore || 0}/100
            </Badge>
          </div>
          <Progress value={dataQualityScore || 0} className="h-2 mb-2" />
          <p className="text-sm text-muted-foreground">
            {dataSummary?.dataQuality?.recommendation || "基于样本量和数据多样性评估"}
          </p>
        </GlassCard>
      )}

      {/* Cross-Platform Resonance */}
      {dataSummary?.crossPlatformResonance?.length ? (
        <GlassCard padding="md">
          <SectionHeading emoji="🔗" title="跨平台强刚需" />
          <Badge variant="outline" className="ml-2 mb-4 bg-accent/10 text-accent border-accent/20">多平台验证</Badge>
          <div className="space-y-4">
            {dataSummary.crossPlatformResonance
              .filter((r: any) => r.isHighIntensity)
              .slice(0, 5)
              .map((resonance: any, i: number) => (
                <div key={i} className="p-3 bg-accent/5 rounded-lg border border-accent/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{resonance.keyword}</span>
                      <Badge variant="secondary" className="text-xs">{resonance.totalMentions} 次提及</Badge>
                    </div>
                    <div className="flex gap-1">
                      {resonance.platforms.map((p: string, j: number) => (
                        <span key={j} className="text-lg" title={p === 'xiaohongshu' ? '小红书' : '抖音'}>
                          {p === 'xiaohongshu' ? '📕' : p === 'douyin' ? '🎵' : '📱'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {resonance.sampleQuotes.slice(0, 2).map((q: any, j: number) => (
                      <p key={j} className="text-xs text-muted-foreground italic">
                        [{q.platform === 'xiaohongshu' ? '小红书' : '抖音'}] "{q.quote.slice(0, 60)}..."
                      </p>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Keywords Used */}
      {keywordsUsed && Object.keys(keywordsUsed).length > 0 && (
        <GlassCard padding="md">
          <SectionHeading emoji="🔍" title="搜索关键词" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keywordsUsed.coreKeywords?.length ? (
              <div>
                <span className="text-xs text-muted-foreground">核心关键词</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {keywordsUsed.coreKeywords.map((k, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {keywordsUsed.userPhrases?.length ? (
              <div>
                <span className="text-xs text-muted-foreground">用户搜索词</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {keywordsUsed.userPhrases.map((k, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </GlassCard>
      )}

      {/* Pain Point Clusters */}
      {dataSummary?.painPointClusters?.length ? (
        <GlassCard padding="md">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-accent" />
            用户痛点聚类
          </h3>
          <div className="space-y-4">
            {dataSummary.painPointClusters.slice(0, 5).map((p: any, i: number) => (
              <div key={i} className="border-l-2 border-primary/30 pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{p.theme}</span>
                  <Badge className={`text-xs ${typeLabels[p.type]?.color || ''}`}>
                    {typeLabels[p.type]?.label || p.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">×{p.frequency}</span>
                </div>
                {p.sampleQuotes?.slice(0, 2).map((q: string, j: number) => (
                  <p key={j} className="text-sm text-muted-foreground italic">"{q.slice(0, 80)}..."</p>
                ))}
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Market Signals */}
      {dataSummary?.marketSignals?.length ? (
        <GlassCard padding="md">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            市场信号
          </h3>
          <div className="space-y-3">
            {dataSummary.marketSignals.slice(0, 4).map((s: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-muted/30">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">{s.signal}</span>
                  <Badge variant="outline" className="text-xs">置信度 {s.confidence}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{s.implication}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* No data fallback */}
      {!hasInsightsData && trendTimelineData.length === 0 && xiaohongshuData.contentTypes.length === 0 && (
        <GlassCard className="p-8 text-center">
          <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium mb-2">暂无数据洞察</h3>
          <p className="text-sm text-muted-foreground">
            此报告生成时未使用数据摘要功能。新的验证将自动包含数据洞察。
          </p>
        </GlassCard>
      )}
    </div>
  );
}
