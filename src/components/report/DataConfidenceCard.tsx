import { Shield, AlertTriangle, CheckCircle, Info, Database, TrendingUp, BarChart3 } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
       Tooltip,
       TooltipContent,
       TooltipProvider,
       TooltipTrigger,
} from "@/components/ui/tooltip";

interface DataConfidenceCardProps {
       sampleSize: number;
       platforms: { name: string; count: number }[];
       dataFreshness?: "fresh" | "moderate" | "stale";
       qualityScore?: number;
       className?: string;
}

const getConfidenceLevel = (sampleSize: number): {
       level: "high" | "medium" | "low";
       label: string;
       color: string;
       bgColor: string;
       description: string;
       minRecommended: number;
} => {
       if (sampleSize >= 100) {
              return {
                     level: "high",
                     label: "高可信度",
                     color: "text-green-500",
                     bgColor: "bg-green-500/10",
                     description: "样本量充足，结论具有较高参考价值",
                     minRecommended: 100,
              };
       } else if (sampleSize >= 30) {
              return {
                     level: "medium",
                     label: "中等可信度",
                     color: "text-yellow-500",
                     bgColor: "bg-yellow-500/10",
                     description: "样本量适中，结论可作参考但建议补充验证",
                     minRecommended: 100,
              };
       } else {
              return {
                     level: "low",
                     label: "低可信度",
                     color: "text-red-500",
                     bgColor: "bg-red-500/10",
                     description: "样本量较少，建议增加数据源后重新分析",
                     minRecommended: 100,
              };
       }
};

const getFreshnessConfig = (freshness: "fresh" | "moderate" | "stale") => {
       const configs = {
              fresh: { label: "最近7天", color: "text-green-500", icon: "🟢" },
              moderate: { label: "7-30天", color: "text-yellow-500", icon: "🟡" },
              stale: { label: "超过30天", color: "text-red-500", icon: "🔴" },
       };
       return configs[freshness];
};

export const DataConfidenceCard = ({
       sampleSize,
       platforms,
       dataFreshness = "fresh",
       qualityScore,
       className = "",
}: DataConfidenceCardProps) => {
       const confidence = getConfidenceLevel(sampleSize);
       const freshness = getFreshnessConfig(dataFreshness);
       const totalPlatformSamples = platforms.reduce((sum, p) => sum + p.count, 0);

       // Calculate overall confidence percentage
       const sampleConfidence = Math.min((sampleSize / confidence.minRecommended) * 100, 100);
       const platformDiversity = Math.min((platforms.length / 3) * 100, 100);
       const freshnessScore = dataFreshness === "fresh" ? 100 : dataFreshness === "moderate" ? 60 : 30;

       const overallConfidence = Math.round((sampleConfidence * 0.5 + platformDiversity * 0.3 + freshnessScore * 0.2));

       return (
              <GlassCard className={`p-5 ${className}`}>
                     {/* Header */}
                     <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                   <Shield className={`w-5 h-5 ${confidence.color}`} />
                                   <h4 className="font-semibold">数据可信度</h4>
                                   <TooltipProvider>
                                          <Tooltip>
                                                 <TooltipTrigger>
                                                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                                                 </TooltipTrigger>
                                                 <TooltipContent className="max-w-xs">
                                                        <p className="text-sm">{confidence.description}</p>
                                                 </TooltipContent>
                                          </Tooltip>
                                   </TooltipProvider>
                            </div>
                            <Badge variant="outline" className={`${confidence.color} ${confidence.bgColor}`}>
                                   {confidence.label}
                            </Badge>
                     </div>

                     {/* Overall Confidence Bar */}
                     <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1.5">
                                   <span className="text-muted-foreground">综合置信度</span>
                                   <span className={confidence.color}>{overallConfidence}%</span>
                            </div>
                            <Progress value={overallConfidence} className="h-2" />
                     </div>

                     {/* Metrics Grid */}
                     <div className="grid grid-cols-3 gap-3 mb-4">
                            {/* Sample Size */}
                            <div className="p-3 rounded-xl bg-card/50 text-center">
                                   <Database className="w-4 h-4 mx-auto mb-1 text-primary" />
                                   <div className="text-lg font-bold">{sampleSize}</div>
                                   <div className="text-[10px] text-muted-foreground">样本数量</div>
                                   {sampleSize < 100 && (
                                          <div className="text-[10px] text-yellow-500 mt-1">建议 &gt;100</div>
                                   )}
                            </div>

                            {/* Platform Coverage */}
                            <div className="p-3 rounded-xl bg-card/50 text-center">
                                   <BarChart3 className="w-4 h-4 mx-auto mb-1 text-secondary" />
                                   <div className="text-lg font-bold">{platforms.length}</div>
                                   <div className="text-[10px] text-muted-foreground">数据源</div>
                                   {platforms.length < 2 && (
                                          <div className="text-[10px] text-yellow-500 mt-1">建议多平台</div>
                                   )}
                            </div>

                            {/* Data Freshness */}
                            <div className="p-3 rounded-xl bg-card/50 text-center">
                                   <TrendingUp className="w-4 h-4 mx-auto mb-1 text-accent" />
                                   <div className="text-sm font-bold">{freshness.icon}</div>
                                   <div className="text-[10px] text-muted-foreground">{freshness.label}</div>
                            </div>
                     </div>

                     {/* Platform Breakdown */}
                     <div className="space-y-2">
                            <div className="text-xs text-muted-foreground mb-2">数据来源分布</div>
                            {platforms.map((platform, i) => {
                                   const percentage = totalPlatformSamples > 0
                                          ? Math.round((platform.count / totalPlatformSamples) * 100)
                                          : 0;
                                   return (
                                          <div key={i} className="flex items-center gap-2">
                                                 <span className="text-xs w-16 truncate">{platform.name}</span>
                                                 <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                               className="h-full bg-primary rounded-full transition-all"
                                                               style={{ width: `${percentage}%` }}
                                                        />
                                                 </div>
                                                 <span className="text-xs text-muted-foreground w-12 text-right">
                                                        {platform.count} 条
                                                 </span>
                                          </div>
                                   );
                            })}
                     </div>

                     {/* Improvement Suggestions */}
                     {(sampleSize < 100 || platforms.length < 2) && (
                            <div className="mt-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                                   <div className="flex items-start gap-2">
                                          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                                          <div className="text-xs text-muted-foreground">
                                                 <span className="font-medium text-yellow-500">提升建议：</span>
                                                 {sampleSize < 100 && " 增加更多关键词搜索以扩大样本量"}
                                                 {platforms.length < 2 && " 建议同时参考抖音/微博等平台数据"}
                                          </div>
                                   </div>
                            </div>
                     )}

                     {/* Trust Badge */}
                     {sampleSize >= 100 && platforms.length >= 2 && (
                            <div className="mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                                   <div className="flex items-center gap-2">
                                          <CheckCircle className="w-4 h-4 text-green-500" />
                                          <span className="text-xs text-green-500 font-medium">
                                                 ✓ 数据充足，分析结论可信度高
                                          </span>
                                   </div>
                            </div>
                     )}
              </GlassCard>
       );
};

export default DataConfidenceCard;
