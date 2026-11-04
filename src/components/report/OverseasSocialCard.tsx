import { Globe2, MessageCircle, FileText, Activity, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/shared";

const labels: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", reddit: "Reddit", twitter: "X / Twitter", threads: "Threads" };

export function OverseasSocialCard({ data }: { data: any }) {
  if (!data) return null;
  const aggregate = data.aggregate || { totalPosts: 0, totalComments: 0, totalEngagement: 0 };
  const platforms = Object.entries(data.platforms || {}) as Array<[string, any]>;
  return (
    <GlassCard padding="md" className="border-primary/15 bg-primary/[0.03]">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Globe2 className="w-5 h-5" /></div>
          <div><h3 className="font-semibold">海外社媒数据</h3><p className="text-xs text-muted-foreground">已采集的原文用于研究，平台失败或缺失不会被当作需求不存在</p></div>
        </div>
        <span className="text-xs text-muted-foreground">{data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : "未记录时间"}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-card/70 p-3"><FileText className="w-4 h-4 text-primary mb-1" /><strong className="number-highlight">{aggregate.totalPosts}</strong><p className="text-xs text-muted-foreground">帖子</p></div>
        <div className="rounded-xl bg-card/70 p-3"><MessageCircle className="w-4 h-4 text-secondary mb-1" /><strong className="number-highlight">{aggregate.totalComments}</strong><p className="text-xs text-muted-foreground">评论</p></div>
        <div className="rounded-xl bg-card/70 p-3"><Activity className="w-4 h-4 text-accent mb-1" /><strong className="number-highlight">{aggregate.totalEngagement}</strong><p className="text-xs text-muted-foreground">互动量</p></div>
      </div>
      <div className="space-y-2">
        {platforms.map(([platform, result]) => (
          <div key={platform} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 px-3 py-2">
            <span className="font-medium">{labels[platform] || platform}</span>
            {result.status === "success" || result.status === "partial" ? <span className={`text-xs ${result.status==='partial'?'text-amber-600':'text-green-600'}`}>{result.status==='partial'?'采集不完整 · ':''}{result.posts?.length || 0} 帖子 · {result.comments?.length || 0} 评论</span> : <span className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="w-3 h-3" />{result.error || "采集失败"}</span>}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
