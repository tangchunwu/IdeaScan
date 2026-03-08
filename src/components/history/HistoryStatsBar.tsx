import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { GlassCard } from "@/components/shared";
import { TrendingUp, Award, BarChart3, Activity } from "lucide-react";
import type { Validation } from "@/services/validationService";

interface HistoryStatsBarProps {
  validations: Validation[];
}

export function HistoryStatsBar({ validations }: HistoryStatsBarProps) {
  const stats = useMemo(() => {
    const completed = validations.filter(v => v.status === "completed");
    const scores = completed.map(v => v.overall_score || 0).filter(s => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

    // Monthly trend (last 6 months)
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      const count = validations.filter(v => {
        const vd = new Date(v.created_at);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return { name: label, value: count };
    });

    return { total: validations.length, completed: completed.length, avgScore, maxScore, monthlyData };
  }, [validations]);

  if (validations.length === 0) return null;

  const items = [
    { label: "总验证数", value: stats.total, icon: BarChart3, color: "text-primary" },
    { label: "已完成", value: stats.completed, icon: Activity, color: "text-secondary" },
    { label: "平均分", value: stats.avgScore || "—", icon: TrendingUp, color: "text-accent" },
    { label: "最高分", value: stats.maxScore || "—", icon: Award, color: "text-amber-500" },
  ];

  return (
    <GlassCard className="mb-6 animate-slide-up">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 p-2">
              <div className="p-2 rounded-xl bg-muted/40">
                <Icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          );
        })}

        {/* Mini trend chart */}
        <div className="col-span-2 md:col-span-1 flex flex-col justify-center">
          <p className="text-xs text-muted-foreground mb-1">近6月趋势</p>
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyData}>
                <defs>
                  <linearGradient id="statsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#statsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
