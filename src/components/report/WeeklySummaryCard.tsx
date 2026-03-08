import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, TrendingUp, Zap } from "lucide-react";

interface WeeklyStats {
  thisWeekCount: number;
  lastWeekCount: number;
  avgScore: number;
  bestIdea: string | null;
  bestScore: number;
}

export function WeeklySummaryCard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);

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
        const scores = items.map((v) => v.overall_score || 0).filter(Boolean);
        const best = items.reduce((a, b) => ((b.overall_score || 0) > (a.overall_score || 0) ? b : a), items[0]);

        setStats({
          thisWeekCount: items.length,
          lastWeekCount: lastWeek?.length || 0,
          avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          bestIdea: best?.idea?.slice(0, 30) || null,
          bestScore: best?.overall_score || 0,
        });
      } catch (e) {
        console.error("Weekly stats error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (!user || loading || !stats) return null;
  if (stats.thisWeekCount === 0 && stats.lastWeekCount === 0) return null;

  const trend = stats.thisWeekCount - stats.lastWeekCount;

  return (
    <GlassCard className="animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-semibold text-sm text-foreground">本周摘要</h4>
        <Badge variant="secondary" className="text-[10px]">
          Weekly
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <p className="text-xl font-bold text-primary">{stats.thisWeekCount}</p>
          <p className="text-[10px] text-muted-foreground">本周验证</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-foreground">{stats.avgScore}</p>
          <p className="text-[10px] text-muted-foreground">平均分</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <TrendingUp className={`w-3 h-3 ${trend >= 0 ? "text-secondary" : "text-destructive"}`} />
            <p className={`text-xl font-bold ${trend >= 0 ? "text-secondary" : "text-destructive"}`}>
              {trend >= 0 ? `+${trend}` : trend}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">环比变化</p>
        </div>
      </div>

      {stats.bestIdea && (
        <div className="pt-2 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-muted-foreground">本周最佳：</span>
          </div>
          <p className="text-xs font-medium text-foreground mt-0.5 truncate">
            {stats.bestIdea}... <span className="text-primary">{stats.bestScore}分</span>
          </p>
        </div>
      )}
    </GlassCard>
  );
}
