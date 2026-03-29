import React, { useState } from "react";
import { GlassCard, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSkinToast } from "@/hooks/useSkinToast";
import { SkinSwitch as Switch } from "@/components/skin";
import {
  RefreshCw, BarChart3, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { hunterService, RawMarketSignal } from "@/services/hunterService";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STALE_TIME = 5 * 60 * 1000; // 5 min

const AdminMonitorTab = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const skinToast = useSkinToast();
  const queryClient = useQueryClient();

  // ── Data queries ──
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["hunter-admin-stats"],
    queryFn: () => hunterService.getSignalStats(),
    staleTime: STALE_TIME,
  });

  const { data: signals = [], isLoading: signalsLoading } = useQuery({
    queryKey: ["hunter-admin-signals"],
    queryFn: () => hunterService.getRecentSignalsForAdmin(15),
    staleTime: STALE_TIME,
  });

  const { data: schedulerConfig, isLoading: schedulerLoading } = useQuery({
    queryKey: ["hunter-scheduler-config"],
    queryFn: () => hunterService.getSchedulerConfig(),
    staleTime: STALE_TIME,
  });

  const { data: cronInfo = { lastRunAt: null, insightsToday: 0, lastKeyword: null } } = useQuery({
    queryKey: ["hunter-cron-info"],
    queryFn: () => hunterService.getLastCronRun(),
    staleTime: STALE_TIME,
  });

  const { data: trendData = [] } = useQuery({
    queryKey: ["hunter-trend-7d"],
    queryFn: () => hunterService.getInsightTrend7Days(),
    staleTime: STALE_TIME,
  });

  // ── Mutations ──
  const toggleSchedulerMutation = useMutation({
    mutationFn: (enabled: boolean) => hunterService.toggleScheduler(enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ["hunter-scheduler-config"] });
      const previous = queryClient.getQueryData(["hunter-scheduler-config"]);
      queryClient.setQueryData(["hunter-scheduler-config"], (old: any) => ({
        ...old,
        enabled,
      }));
      return { previous };
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["hunter-scheduler-config"] });
      toast({ title: enabled ? "✅ 24小时扫描已启动" : "⏸️ 24小时扫描已暂停" });
    },
    onError: (e: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["hunter-scheduler-config"], context.previous);
      }
      toast({ title: "操作失败", description: e.message, variant: "destructive" });
    },
  });

  const processMutation = useMutation({
    mutationFn: () => hunterService.triggerAIProcessor(),
    onSuccess: (result) => {
      toast({
        title: "✅ 处理完成",
        description: `处理 ${result?.processed || 0} 条, 失败 ${result?.failed || 0}, 商机 ${result?.opportunities_upserted || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ["hunter-admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["hunter-admin-signals"] });
    },
    onError: (e: any) => {
      toast({ title: "处理失败", description: e.message, variant: "destructive" });
    },
  });

  const loading = statsLoading || signalsLoading;
  if (loading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

  const schedulerEnabled = schedulerConfig?.enabled ?? false;

  const contentTypeBadge = (type: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      insight: { label: "💡 洞察", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
      intelligence: { label: "🧠 情报", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
      source_citation: { label: "📎 来源", cls: "bg-muted/20 text-muted-foreground border-muted/30" },
      post: { label: "📝 帖子", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
    };
    const info = map[type] || { label: type, cls: "text-muted-foreground" };
    return <Badge variant="outline" className={`text-xs ${info.cls}`}>{info.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "总信号数", value: stats?.total || 0, emoji: "📡" },
          { label: "洞察/情报", value: stats?.insights || 0, emoji: "💡" },
          { label: "高分信号 (≥70)", value: stats?.highScore || 0, emoji: "🔥" },
          { label: "来源引用", value: stats?.citations || 0, emoji: "📎" },
        ].map(s => (
          <GlassCard key={s.label} className="text-center py-4">
            <div className="text-2xl mb-1">{s.emoji}</div>
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </GlassCard>
        ))}
      </div>

      {/* Scheduler Control */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${schedulerEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
            <div>
              <h4 className="font-bold text-foreground text-sm">24 小时自动扫描</h4>
              <p className="text-xs text-muted-foreground">
                {schedulerEnabled ? '每小时自动扫描全网趋势' : '当前已暂停，点击开关启动'}
              </p>
            </div>
          </div>
          <Switch
            checked={schedulerEnabled}
            onCheckedChange={(v) => toggleSchedulerMutation.mutate(v)}
            disabled={schedulerLoading || toggleSchedulerMutation.isPending}
          />
        </div>
        {/* Cron execution info */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t border-white/5 pt-3">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            最近执行: {cronInfo.lastRunAt
              ? formatDistanceToNow(new Date(cronInfo.lastRunAt), { addSuffix: true, locale: zhCN })
              : '暂无记录'}
          </span>
          <span>今日洞察: <strong className="text-foreground">{cronInfo.insightsToday}</strong> / 50</span>
          {cronInfo.lastKeyword && (
            <span>最近领域: <strong className="text-foreground">{cronInfo.lastKeyword}</strong></span>
          )}
        </div>
      </GlassCard>

      {/* 7-Day Insight Trend Chart */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h4 className="font-bold text-foreground text-sm">最近 7 天洞察产出</h4>
          <span className="text-xs text-muted-foreground ml-auto">
            合计: <strong className="text-foreground">{trendData.reduce((s, d) => s + d.count, 0)}</strong> 条
          </span>
        </div>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} 条`, "洞察数"]}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={() => processMutation.mutate()} disabled={processMutation.isPending} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${processMutation.isPending ? 'animate-spin' : ''}`} />
          {processMutation.isPending ? "处理中..." : "触发 AI 处理"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ["hunter-admin-stats"] });
          queryClient.invalidateQueries({ queryKey: ["hunter-admin-signals"] });
        }} className="gap-2">
          <RefreshCw className="w-4 h-4" /> 刷新
        </Button>
      </div>

      {/* Recent Signals */}
      <GlassCard>
        <h4 className="font-bold text-foreground mb-4">最近信号</h4>
        <div className="space-y-2">
          {signals.map(sig => (
            <div
              key={sig.id}
              className="p-3 border border-white/5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              onClick={() => setExpandedId(expandedId === sig.id ? null : sig.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {contentTypeBadge(sig.content_type)}
                  <Badge variant="outline" className={`text-xs ${hunterService.getPlatformInfo(sig.source).bg} ${hunterService.getPlatformInfo(sig.source).color}`}>
                    {hunterService.getPlatformInfo(sig.source).label}
                  </Badge>
                  {sig.opportunity_score != null && (
                    <span className={`text-xs font-mono ${sig.opportunity_score >= 70 ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {sig.opportunity_score}分
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {sig.content.slice(0, 60)}...
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {new Date(sig.scanned_at).toLocaleString()}
                  </span>
                  {expandedId === sig.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
              {expandedId === sig.id && (
                <div className="mt-3 p-3 bg-muted/10 rounded text-sm text-muted-foreground whitespace-pre-wrap">
                  {sig.content}
                  {sig.source_url && (
                    <div className="mt-2">
                      <a href={sig.source_url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">
                        🔗 原文链接
                      </a>
                    </div>
                  )}
                  {sig.topic_tags && sig.topic_tags.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {sig.topic_tags.map(t => (
                        <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

export default AdminMonitorTab;
