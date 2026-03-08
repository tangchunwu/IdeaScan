import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import { PieChartIcon, CheckCircle, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { CustomTooltip } from "./CustomTooltip";
import { SentimentWordCloud } from "./SentimentWordCloud";
import type { ReportDataResult } from "./useReportData";

const SENTIMENT_COLORS = ["hsl(var(--secondary))", "hsl(var(--muted))", "hsl(var(--destructive))"];

interface SentimentTabProps {
  data: ReportDataResult;
}

export function SentimentTab({ data }: SentimentTabProps) {
  const { sentimentAnalysis } = data;

  const sentimentData = [
    { name: "正面", value: sentimentAnalysis.positive },
    { name: "中立", value: sentimentAnalysis.neutral },
    { name: "负面", value: sentimentAnalysis.negative },
  ];

  return (
    <div className="space-y-6">
      <GlassCard className="animate-slide-up">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <PieChartIcon className="w-5 h-5 text-primary" />
          情感分布
        </h3>
        <div className="h-64 flex items-center justify-center">
          <ResponsiveContainer width="50%" height="100%">
            <PieChart>
              <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                {SENTIMENT_COLORS.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            {[
              { name: "正面评价", value: sentimentAnalysis.positive, color: SENTIMENT_COLORS[0] },
              { name: "中立评价", value: sentimentAnalysis.neutral, color: SENTIMENT_COLORS[1] },
              { name: "负面评价", value: sentimentAnalysis.negative, color: SENTIMENT_COLORS[2] },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-semibold text-foreground">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Word Cloud */}
      <SentimentWordCloud
        topPositive={sentimentAnalysis.topPositive || []}
        topNegative={sentimentAnalysis.topNegative || []}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-secondary" />
            正面评价要点
          </h3>
          <div className="space-y-2">
            {(sentimentAnalysis.topPositive || []).map((item: string, index: number) => (
              <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/10">
                <span className="text-secondary">✓</span>
                <span className="text-foreground">{item}</span>
              </div>
            ))}
            {(!sentimentAnalysis.topPositive || sentimentAnalysis.topPositive.length === 0) && (
              <p className="text-muted-foreground">暂无正面评价数据</p>
            )}
          </div>
        </GlassCard>

        <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            负面评价要点
          </h3>
          <div className="space-y-2">
            {(sentimentAnalysis.topNegative || []).map((item: string, index: number) => (
              <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/10">
                <span className="text-destructive">✗</span>
                <span className="text-foreground">{item}</span>
              </div>
            ))}
            {(!sentimentAnalysis.topNegative || sentimentAnalysis.topNegative.length === 0) && (
              <p className="text-muted-foreground">暂无负面评价数据</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
