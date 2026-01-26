import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, TrendingUp, Users, Zap, Database, MessageSquare } from "lucide-react";

interface DataInsightsTabProps {
  dataSummary?: {
    painPointClusters?: {
      theme: string;
      frequency: number;
      sampleQuotes: string[];
      type: 'complaint' | 'question' | 'recommendation' | 'comparison';
    }[];
    competitorMatrix?: {
      category: string;
      count: number;
      topPlayers: string[];
      commonPricing?: string;
    }[];
    marketSignals?: {
      signal: string;
      evidence: string;
      implication: string;
      confidence: number;
    }[];
    keyInsights?: string[];
    dataQuality?: {
      score: number;
      sampleSize: number;
      recommendation: string;
    };
  };
  dataQualityScore?: number;
  keywordsUsed?: {
    coreKeywords?: string[];
    userPhrases?: string[];
    competitorQueries?: string[];
    trendKeywords?: string[];
  };
}

const typeLabels: Record<string, { label: string; color: string }> = {
  complaint: { label: "吐槽", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  question: { label: "求助", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  recommendation: { label: "推荐", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  comparison: { label: "比较", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
};

export function DataInsightsTab({ dataSummary, dataQualityScore, keywordsUsed }: DataInsightsTabProps) {
  const hasData = dataSummary && (dataQualityScore || 0) > 0;

  if (!hasData) {
    return (
      <GlassCard className="p-8 text-center">
        <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-medium mb-2">暂无数据洞察</h3>
        <p className="text-sm text-muted-foreground">
          此报告生成时未使用数据摘要功能。新的验证将自动包含数据洞察。
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Quality Score */}
      <GlassCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            数据质量评分
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

      {/* Keywords Used */}
      {keywordsUsed && Object.keys(keywordsUsed).length > 0 && (
        <GlassCard padding="md">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-secondary" />
            搜索关键词
          </h3>
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
            {dataSummary.painPointClusters.slice(0, 5).map((p, i) => (
              <div key={i} className="border-l-2 border-primary/30 pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{p.theme}</span>
                  <Badge className={`text-xs ${typeLabels[p.type]?.color || ''}`}>
                    {typeLabels[p.type]?.label || p.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">×{p.frequency}</span>
                </div>
                {p.sampleQuotes?.slice(0, 2).map((q, j) => (
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
            {dataSummary.marketSignals.slice(0, 4).map((s, i) => (
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

      {/* Key Insights */}
      {dataSummary?.keyInsights?.length ? (
        <GlassCard padding="md">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            关键洞察
          </h3>
          <ul className="space-y-2">
            {dataSummary.keyInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
