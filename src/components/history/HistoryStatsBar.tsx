import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { GlassCard } from "@/components/shared";
import { TrendingUp, Award, BarChart3, Activity, CalendarDays, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Validation } from "@/services/validationService";

interface HistoryStatsBarProps {
  validations: Validation[];
}

interface WeeklyStats {
  thisWeekCount: number;
  lastWeekCount: number;
  bestIdea: string | null;
  bestScore: number;
}

export function HistoryStatsBar({ validations }: HistoryStatsBarProps) {
  const { user } = useAuth();
  const [weekly, setWeekly] = useState<WeeklyStats | null>(null);

  const stats = useMemo(() => {
    const completed = validations.filter(v => v.status === "completed");
    const scores = completed.map(v => v.overall_score || 0).filter(s => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = `${d.getMonth() + 1}月`;
      const count = validations.filter(v => {
        const vd = new Date(v.created_at);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return { name: label, value: count };
    });

    return { total: validations.length, completed: completed.length, avgScore, maxScore, monthlyData };
  }, [validations]);

  // Fetch weekly stats
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const lastWeekStart = new Date(weekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        const { data: thisWeek } = await supabase
          .from("validations")
          .select("id, idea, overall_score, status")
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString())
          .eq("status", "completed");

        const { data: lastWeek } = await supabase
          .from("validations")
          .select("id")
          .eq("user_id", user.id)
          .gte("created_at", lastWeekStart.toISOString())
          .lt("created_at", weekStart.toISOString())
          .eq("status", "completed");

        const items = thisWeek || [];
        const best = items.reduce((a, b) => ((b.overall_score || 0) > (a.overall_score || 0) ? b : a), items[0]);

        setWeekly({
          thisWeekCount: items.length,
          lastWeekCount: lastWeek?.length || 0,
          bestIdea: best?.idea?.slice(0, 30) || null,
          bestScore: best?.overall_score || 0,
        });
      } catch (e) {
        console.error("Weekly stats error:", e);
      }
    })();
  }, [user]);

  if (validations.length === 0) return null;

  const weekTrend = weekly ? weekly.thisWeekCount - weekly.lastWeekCount : null;

  const items = [
    { label: "总验证数", value: stats.total, icon: BarChart3, color: "text-primary" },
    { label: "已完成", value: stats.completed, icon: Activity, color: "text-secondary" },
    { label: "平均分", value: stats.avgScore || "—", icon: TrendingUp, color: "text-accent" },
    { label: "最高分", value: stats.maxScore || "—", icon: Award, color: "text-amber-500" },
  ];

  return (
    <GlassCard className="mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 p-2">
              <div className="p-2 rounded-xl bg-muted/40">
                <Icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold text-foreground">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          );
        })}

        {/* Weekly trend inline */}
        {weekly && (weekly.thisWeekCount > 0 || weekly.lastWeekCount > 0) && (
          <div className="flex items-center gap-3 p-2">
            <div className="p-2 rounded-xl bg-muted/40">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-foreground">{weekly.thisWeekCount}</span>
                {weekTrend !== null && weekTrend !== 0 && (
                  <span className={`text-xs font-medium ${weekTrend > 0 ? "text-secondary" : "text-destructive"}`}>
                    {weekTrend > 0 ? `+${weekTrend}` : weekTrend}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">本周验证</p>
            </div>
          </div>
        )}

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
          {/* Best idea this week */}
          {weekly?.bestIdea && (
            <div className="flex items-center gap-1 mt-1">
              <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">
                本周最佳: {weekly.bestIdea}… <span className="text-primary">{weekly.bestScore}分</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
