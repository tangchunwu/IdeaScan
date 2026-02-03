import { useState } from "react";
import {
       ScatterChart,
       Scatter,
       XAxis,
       YAxis,
       ZAxis,
       CartesianGrid,
       Tooltip,
       ResponsiveContainer,
       Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/shared";
import { Sparkles, TrendingUp, Flame, BarChart3 } from "lucide-react";

interface OpportunityDataPoint {
       id: string;
       name: string;
       heatScore: number;      // X axis
       growthRate: number;     // Y axis
       sampleSize: number;     // Bubble size
       category?: string;
}

interface OpportunityBubbleChartProps {
       data: OpportunityDataPoint[];
       onBubbleClick?: (item: OpportunityDataPoint) => void;
       className?: string;
}

const CustomTooltip = ({ active, payload }: any) => {
       if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                     <div className="glass-card p-4 border border-border/50 shadow-xl backdrop-blur-md bg-card/90 min-w-[200px]">
                            <p className="font-semibold text-base mb-3 text-foreground">{data.name}</p>
                            <div className="space-y-2">
                                   <div className="flex items-center justify-between text-sm">
                                          <span className="flex items-center gap-1.5 text-muted-foreground">
                                                 <Flame className="w-3.5 h-3.5 text-orange-500" />
                                                 热度
                                          </span>
                                          <span className="font-bold text-orange-500">{data.heatScore}</span>
                                   </div>
                                   <div className="flex items-center justify-between text-sm">
                                          <span className="flex items-center gap-1.5 text-muted-foreground">
                                                 <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                                                 增长率
                                          </span>
                                          <span className="font-bold text-green-500">{data.growthRate}%</span>
                                   </div>
                                   <div className="flex items-center justify-between text-sm">
                                          <span className="flex items-center gap-1.5 text-muted-foreground">
                                                 <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                                                 样本量
                                          </span>
                                          <span className="font-bold text-blue-500">{data.sampleSize}</span>
                                   </div>
                            </div>
                            {data.category && (
                                   <div className="mt-3 pt-3 border-t border-border/50">
                                          <span className="text-xs text-muted-foreground">分类: {data.category}</span>
                                   </div>
                            )}
                     </div>
              );
       }
       return null;
};

// Calculate opportunity score for coloring
const getOpportunityScore = (item: OpportunityDataPoint) => {
       // Higher heat + higher growth + reasonable sample = good opportunity
       return (item.heatScore / 100) * 0.4 + (item.growthRate / 100) * 0.4 + Math.min(item.sampleSize / 1000, 1) * 0.2;
};

const getColor = (score: number) => {
       if (score > 0.7) return "hsl(142, 76%, 36%)";   // Green - High opportunity
       if (score > 0.4) return "hsl(48, 96%, 53%)";   // Yellow - Medium
       return "hsl(var(--muted-foreground))";          // Gray - Low
};

export const OpportunityBubbleChart = ({
       data,
       onBubbleClick,
       className = "",
}: OpportunityBubbleChartProps) => {
       const [highlightedId, setHighlightedId] = useState<string | null>(null);

       // Calculate min/max for proper scaling
       const maxSampleSize = Math.max(...data.map((d) => d.sampleSize), 100);
       const minBubbleSize = 60;
       const maxBubbleSize = 400;

       return (
              <GlassCard className={`p-6 ${className}`}>
                     <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                   <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
                                          <Sparkles className="w-5 h-5 text-primary" />
                                   </div>
                                   <div>
                                          <h3 className="font-semibold text-lg">机会气泡图</h3>
                                          <p className="text-sm text-muted-foreground">
                                                 气泡越大代表数据量越多，越靠右上角机会越大
                                          </p>
                                   </div>
                            </div>
                     </div>

                     {/* Legend */}
                     <div className="flex flex-wrap gap-4 mb-4 text-xs">
                            <div className="flex items-center gap-2">
                                   <div className="w-3 h-3 rounded-full bg-green-500" />
                                   <span className="text-muted-foreground">高机会</span>
                            </div>
                            <div className="flex items-center gap-2">
                                   <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                   <span className="text-muted-foreground">中机会</span>
                            </div>
                            <div className="flex items-center gap-2">
                                   <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                                   <span className="text-muted-foreground">待观察</span>
                            </div>
                     </div>

                     {/* Chart */}
                     <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                   <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                          <XAxis
                                                 type="number"
                                                 dataKey="heatScore"
                                                 name="热度"
                                                 stroke="hsl(var(--muted-foreground))"
                                                 tick={{ fontSize: 11 }}
                                                 tickLine={false}
                                                 axisLine={false}
                                                 label={{ value: "热度 →", position: "bottom", offset: -5, fontSize: 12 }}
                                          />
                                          <YAxis
                                                 type="number"
                                                 dataKey="growthRate"
                                                 name="增长率"
                                                 unit="%"
                                                 stroke="hsl(var(--muted-foreground))"
                                                 tick={{ fontSize: 11 }}
                                                 tickLine={false}
                                                 axisLine={false}
                                                 label={{ value: "增长率 ↑", angle: -90, position: "left", offset: 10, fontSize: 12 }}
                                          />
                                          <ZAxis
                                                 type="number"
                                                 dataKey="sampleSize"
                                                 range={[minBubbleSize, maxBubbleSize]}
                                                 name="样本量"
                                          />
                                          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                          <Scatter
                                                 data={data}
                                                 onClick={(data) => onBubbleClick?.(data)}
                                                 onMouseEnter={(data) => setHighlightedId(data.id)}
                                                 onMouseLeave={() => setHighlightedId(null)}
                                          >
                                                 {data.map((entry, index) => {
                                                        const score = getOpportunityScore(entry);
                                                        const isHighlighted = highlightedId === entry.id;
                                                        return (
                                                               <Cell
                                                                      key={entry.id}
                                                                      fill={getColor(score)}
                                                                      fillOpacity={isHighlighted ? 1 : 0.7}
                                                                      stroke={isHighlighted ? "hsl(var(--foreground))" : "transparent"}
                                                                      strokeWidth={2}
                                                                      style={{ cursor: "pointer", transition: "all 0.2s" }}
                                                               />
                                                        );
                                                 })}
                                          </Scatter>
                                   </ScatterChart>
                            </ResponsiveContainer>
                     </div>

                     {/* High Opportunity Highlights */}
                     <div className="mt-4 pt-4 border-t border-border/50">
                            <p className="text-sm font-medium mb-2">🔥 高潜力机会:</p>
                            <div className="flex flex-wrap gap-2">
                                   {data
                                          .filter((d) => getOpportunityScore(d) > 0.6)
                                          .slice(0, 5)
                                          .map((item) => (
                                                 <Button
                                                        key={item.id}
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => onBubbleClick?.(item)}
                                                        className="h-7 text-xs"
                                                 >
                                                        {item.name}
                                                 </Button>
                                          ))}
                                   {data.filter((d) => getOpportunityScore(d) > 0.6).length === 0 && (
                                          <span className="text-sm text-muted-foreground">暂无显著高潜力机会</span>
                                   )}
                            </div>
                     </div>
              </GlassCard>
       );
};

export default OpportunityBubbleChart;
