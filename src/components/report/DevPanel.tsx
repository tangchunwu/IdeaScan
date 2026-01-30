import { useState } from "react";
import { ChevronDown, ChevronUp, Database, Clock, Brain, Activity, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ValidationReport } from "@/services/validationService";

// 管理员邮箱列表
const ADMIN_EMAILS = ["chunmianhua@gmail.com"];

interface DevPanelProps {
       report: ValidationReport | null;
       validationId: string;
}

export function DevPanel({ report, validationId }: DevPanelProps) {
       const { user } = useAuth();
       const [isExpanded, setIsExpanded] = useState(false);

       // 只有管理员可见
       if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
              return null;
       }

       // 提取数据统计 (使用 any 类型来兼容动态字段)
       const xiaohongshuData = (report?.xiaohongshu_data || {}) as any;
       const competitorData = report?.competitor_data || [];
       const dataSummary = report?.data_summary;
       const keywordsUsed = report?.keywords_used;
       const dataQualityScore = report?.data_quality_score;

       // 数据源统计
       const dataSourceStats = {
              xiaohongshu: {
                     notes: xiaohongshuData.totalNotes || 0,
                     comments: xiaohongshuData.sampleComments?.length || 0,
              },
              search: {
                     total: competitorData.length || 0,
              },
       };

       return (
              <div className="mt-8 border border-amber-500/30 rounded-xl bg-amber-500/5 overflow-hidden">
                     {/* Header */}
                     <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-amber-500/10 transition-colors"
                     >
                            <div className="flex items-center gap-3">
                                   <Shield className="w-5 h-5 text-amber-500" />
                                   <span className="font-semibold text-amber-500">开发者调试面板</span>
                                   <span className="text-xs text-muted-foreground">(仅管理员可见)</span>
                            </div>
                            {isExpanded ? (
                                   <ChevronUp className="w-5 h-5 text-amber-500" />
                            ) : (
                                   <ChevronDown className="w-5 h-5 text-amber-500" />
                            )}
                     </button>

                     {/* Content */}
                     {isExpanded && (
                            <div className="px-6 pb-6 space-y-6">
                                   {/* 验证 ID */}
                                   <div className="text-xs text-muted-foreground">
                                          验证 ID: <code className="bg-muted px-2 py-0.5 rounded">{validationId}</code>
                                   </div>

                                   {/* 数据源统计 */}
                                   <div className="space-y-3">
                                          <h4 className="text-sm font-semibold flex items-center gap-2">
                                                 <Database className="w-4 h-4 text-primary" />
                                                 数据采集统计
                                          </h4>
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                 <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                        <div className="text-xs text-muted-foreground">小红书笔记</div>
                                                        <div className="text-lg font-semibold">{dataSourceStats.xiaohongshu.notes}</div>
                                                 </div>
                                                 <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                        <div className="text-xs text-muted-foreground">小红书评论</div>
                                                        <div className="text-lg font-semibold">{dataSourceStats.xiaohongshu.comments}</div>
                                                 </div>
                                                 <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                        <div className="text-xs text-muted-foreground">竞品搜索结果</div>
                                                        <div className="text-lg font-semibold">{dataSourceStats.search.total}</div>
                                                 </div>
                                                 <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                        <div className="text-xs text-muted-foreground">数据质量分</div>
                                                        <div className={`text-lg font-semibold ${(dataQualityScore || 0) >= 70 ? 'text-green-500' :
                                                               (dataQualityScore || 0) >= 40 ? 'text-yellow-500' : 'text-red-500'
                                                               }`}>
                                                               {dataQualityScore || 'N/A'}
                                                        </div>
                                                 </div>
                                          </div>
                                   </div>

                                   {/* 关键词使用情况 */}
                                   {keywordsUsed && (
                                          <div className="space-y-3">
                                                 <h4 className="text-sm font-semibold flex items-center gap-2">
                                                        <Brain className="w-4 h-4 text-secondary" />
                                                        关键词扩展
                                                 </h4>
                                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                        {keywordsUsed.coreKeywords && keywordsUsed.coreKeywords.length > 0 && (
                                                               <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                                      <div className="text-muted-foreground mb-1">核心关键词</div>
                                                                      <div className="flex flex-wrap gap-1">
                                                                             {keywordsUsed.coreKeywords.map((kw, i) => (
                                                                                    <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded">{kw}</span>
                                                                             ))}
                                                                      </div>
                                                               </div>
                                                        )}
                                                        {keywordsUsed.userPhrases && keywordsUsed.userPhrases.length > 0 && (
                                                               <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                                      <div className="text-muted-foreground mb-1">用户表达</div>
                                                                      <div className="flex flex-wrap gap-1">
                                                                             {keywordsUsed.userPhrases.map((kw, i) => (
                                                                                    <span key={i} className="px-2 py-0.5 bg-secondary/10 text-secondary rounded">{kw}</span>
                                                                             ))}
                                                                      </div>
                                                               </div>
                                                        )}
                                                        {keywordsUsed.competitorQueries && keywordsUsed.competitorQueries.length > 0 && (
                                                               <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                                      <div className="text-muted-foreground mb-1">竞品搜索词</div>
                                                                      <div className="flex flex-wrap gap-1">
                                                                             {keywordsUsed.competitorQueries.map((kw, i) => (
                                                                                    <span key={i} className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded">{kw}</span>
                                                                             ))}
                                                                      </div>
                                                               </div>
                                                        )}
                                                        {keywordsUsed.trendKeywords && keywordsUsed.trendKeywords.length > 0 && (
                                                               <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                                      <div className="text-muted-foreground mb-1">趋势关键词</div>
                                                                      <div className="flex flex-wrap gap-1">
                                                                             {keywordsUsed.trendKeywords.map((kw, i) => (
                                                                                    <span key={i} className="px-2 py-0.5 bg-green-500/10 text-green-500 rounded">{kw}</span>
                                                                             ))}
                                                                      </div>
                                                               </div>
                                                        )}
                                                 </div>
                                          </div>
                                   )}

                                   {/* 数据摘要信息 */}
                                   {dataSummary && (
                                          <div className="space-y-3">
                                                 <h4 className="text-sm font-semibold flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-green-500" />
                                                        数据摘要
                                                 </h4>
                                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                                        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                               <div className="text-muted-foreground mb-1">痛点聚类数</div>
                                                               <div className="text-lg font-semibold">{dataSummary.painPointClusters?.length || 0}</div>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                               <div className="text-muted-foreground mb-1">竞品分类数</div>
                                                               <div className="text-lg font-semibold">{dataSummary.competitorMatrix?.length || 0}</div>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                               <div className="text-muted-foreground mb-1">市场信号数</div>
                                                               <div className="text-lg font-semibold">{dataSummary.marketSignals?.length || 0}</div>
                                                        </div>
                                                 </div>

                                                 {/* 关键洞察 */}
                                                 {dataSummary.keyInsights && dataSummary.keyInsights.length > 0 && (
                                                        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                               <div className="text-muted-foreground mb-2 text-xs">关键洞察</div>
                                                               <ul className="space-y-1 text-sm">
                                                                      {dataSummary.keyInsights.slice(0, 5).map((insight, i) => (
                                                                             <li key={i} className="flex items-start gap-2">
                                                                                    <span className="text-primary">•</span>
                                                                                    <span>{insight}</span>
                                                                             </li>
                                                                      ))}
                                                               </ul>
                                                        </div>
                                                 )}

                                                 {/* 数据质量详情 */}
                                                 {dataSummary.dataQuality && (
                                                        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                                                               <div className="text-muted-foreground mb-2 text-xs">数据质量详情</div>
                                                               <div className="grid grid-cols-4 gap-2 text-xs">
                                                                      <div>
                                                                             <span className="text-muted-foreground">样本量: </span>
                                                                             <span className="font-medium">{dataSummary.dataQuality.sampleSize}</span>
                                                                      </div>
                                                                      <div>
                                                                             <span className="text-muted-foreground">多样性: </span>
                                                                             <span className="font-medium">{dataSummary.dataQuality.diversityScore}</span>
                                                                      </div>
                                                                      <div>
                                                                             <span className="text-muted-foreground">时效性: </span>
                                                                             <span className="font-medium">{dataSummary.dataQuality.recencyScore}</span>
                                                                      </div>
                                                                      <div>
                                                                             <span className="text-muted-foreground">综合分: </span>
                                                                             <span className="font-medium">{dataSummary.dataQuality.score}</span>
                                                                      </div>
                                                               </div>
                                                               {dataSummary.dataQuality.recommendation && (
                                                                      <div className="mt-2 text-xs text-muted-foreground">
                                                                             建议: {dataSummary.dataQuality.recommendation}
                                                                      </div>
                                                               )}
                                                        </div>
                                                 )}
                                          </div>
                                   )}

                                   {/* 原始数据预览 */}
                                   <div className="space-y-3">
                                          <h4 className="text-sm font-semibold flex items-center gap-2">
                                                 <Clock className="w-4 h-4 text-muted-foreground" />
                                                 原始数据预览
                                          </h4>
                                          <div className="p-3 rounded-lg bg-muted/30 border border-border/30 max-h-60 overflow-auto">
                                                 <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                                                        {JSON.stringify({
                                                               xiaohongshu_sample_notes: xiaohongshuData.sampleNotes?.slice(0, 3),
                                                               xiaohongshu_sample_comments: xiaohongshuData.sampleComments?.slice(0, 5),
                                                               competitor_sample: competitorData.slice(0, 3),
                                                        }, null, 2)}
                                                 </pre>
                                          </div>
                                   </div>
                            </div>
                     )}
              </div>
       );
}
