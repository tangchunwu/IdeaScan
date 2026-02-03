import { useState } from "react";
import {
       AreaChart,
       Area,
       XAxis,
       YAxis,
       CartesianGrid,
       Tooltip,
       ResponsiveContainer,
       ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/shared";
import { TrendingUp, Calendar } from "lucide-react";

interface TrendDataPoint {
       date: string;
       value: number;
       label?: string;
}

interface TrendTimelineChartProps {
       data: TrendDataPoint[];
       title?: string;
       className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
       if (active && payload && payload.length) {
              return (
                     <div className="glass-card p-3 border border-border/50 shadow-xl backdrop-blur-md bg-card/80">
                            <p className="font-medium text-sm mb-1 text-foreground">{label}</p>
                            <div className="flex items-center gap-2 text-sm">
                                   <TrendingUp className="w-4 h-4 text-primary" />
                                   <span className="text-muted-foreground">热度:</span>
                                   <span className="font-bold text-primary">{payload[0].value}</span>
                            </div>
                     </div>
              );
       }
       return null;
};

export const TrendTimelineChart = ({
       data,
       title = "热度趋势",
       className = "",
}: TrendTimelineChartProps) => {
       const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");

       // Filter data based on time range
       const getFilteredData = () => {
              const now = new Date();
              const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
              const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

              return data.filter((point) => {
                     const pointDate = new Date(point.date);
                     return pointDate >= cutoff;
              });
       };

       const filteredData = getFilteredData();

       // Calculate average and peak
       const values = filteredData.map((d) => d.value);
       const avgValue = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
       const maxValue = values.length > 0 ? Math.max(...values) : 0;
       const minValue = values.length > 0 ? Math.min(...values) : 0;

       // Calculate growth rate
       const growthRate = values.length >= 2
              ? Math.round(((values[values.length - 1] - values[0]) / values[0]) * 100)
              : 0;

       return (
              <GlassCard className={`p-6 ${className}`}>
                     <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                   <div className="p-2 rounded-xl bg-primary/10">
                                          <TrendingUp className="w-5 h-5 text-primary" />
                                   </div>
                                   <div>
                                          <h3 className="font-semibold text-lg">{title}</h3>
                                          <p className="text-sm text-muted-foreground">
                                                 {growthRate >= 0 ? "↑" : "↓"} {Math.abs(growthRate)}% 较期初
                                          </p>
                                   </div>
                            </div>

                            <div className="flex items-center gap-2">
                                   {(["7d", "30d", "90d"] as const).map((range) => (
                                          <Button
                                                 key={range}
                                                 variant={timeRange === range ? "default" : "outline"}
                                                 size="sm"
                                                 onClick={() => setTimeRange(range)}
                                                 className="h-8 px-3"
                                          >
                                                 {range === "7d" ? "7天" : range === "30d" ? "30天" : "90天"}
                                          </Button>
                                   ))}
                            </div>
                     </div>

                     {/* Stats Row */}
                     <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="text-center p-3 rounded-xl bg-muted/30">
                                   <p className="text-2xl font-bold text-primary">{maxValue}</p>
                                   <p className="text-xs text-muted-foreground">峰值</p>
                            </div>
                            <div className="text-center p-3 rounded-xl bg-muted/30">
                                   <p className="text-2xl font-bold text-foreground">{avgValue}</p>
                                   <p className="text-xs text-muted-foreground">平均</p>
                            </div>
                            <div className="text-center p-3 rounded-xl bg-muted/30">
                                   <p className={`text-2xl font-bold ${growthRate >= 0 ? "text-green-500" : "text-red-500"}`}>
                                          {growthRate >= 0 ? "+" : ""}{growthRate}%
                                   </p>
                                   <p className="text-xs text-muted-foreground">增长率</p>
                            </div>
                     </div>

                     {/* Chart */}
                     <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                   <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                          <defs>
                                                 <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                                 </linearGradient>
                                          </defs>
                                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                          <XAxis
                                                 dataKey="date"
                                                 stroke="hsl(var(--muted-foreground))"
                                                 tick={{ fontSize: 11 }}
                                                 tickLine={false}
                                                 axisLine={false}
                                                 tickFormatter={(value) => {
                                                        const date = new Date(value);
                                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                                 }}
                                          />
                                          <YAxis
                                                 stroke="hsl(var(--muted-foreground))"
                                                 tick={{ fontSize: 11 }}
                                                 tickLine={false}
                                                 axisLine={false}
                                                 domain={[minValue * 0.9, maxValue * 1.1]}
                                          />
                                          <Tooltip content={<CustomTooltip />} />
                                          <ReferenceLine
                                                 y={avgValue}
                                                 stroke="hsl(var(--muted-foreground))"
                                                 strokeDasharray="5 5"
                                                 label={{ value: "平均", position: "right", fontSize: 10 }}
                                          />
                                          <Area
                                                 type="monotone"
                                                 dataKey="value"
                                                 stroke="hsl(var(--primary))"
                                                 strokeWidth={2}
                                                 fillOpacity={1}
                                                 fill="url(#trendGradient)"
                                                 animationDuration={1000}
                                          />
                                   </AreaChart>
                            </ResponsiveContainer>
                     </div>

                     <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>数据更新时间: {new Date().toLocaleDateString("zh-CN")}</span>
                     </div>
              </GlassCard>
       );
};

export default TrendTimelineChart;
