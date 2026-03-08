import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageBackground, GlassCard, Navbar, EmptyState, ChartSkeleton } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Sparkles, Share2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useReportData } from "@/components/report/useReportData";
import { ScoreHeroCard } from "@/components/report/ScoreHeroCard";
import { RadarDimensionSection } from "@/components/report/RadarDimensionSection";
import { DataOverviewTab } from "@/components/report/DataOverviewTab";
import { useToast } from "@/hooks/use-toast";

const SharedReport = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(data?.validation?.idea ? `分享报告 - ${data.validation.idea.slice(0, 30)}` : "分享报告", [data?.validation?.idea]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data: result, error: fnErr } = await supabase.functions.invoke("get-shared-report", {
          body: null,
          method: "GET",
          headers: {},
        });
        // functions.invoke doesn't support GET query params easily, use fetch directly
      } catch {}

      // Use fetch directly for GET with query param
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/get-shared-report?token=${encodeURIComponent(token)}`,
          { headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || "报告不存在或链接已失效");
        }
        const json = await resp.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const reportData = useReportData(data);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "链接已复制" });
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <Skeleton className="lg:col-span-4 h-[300px] rounded-3xl" />
              <Skeleton className="lg:col-span-8 h-[300px] rounded-3xl" />
            </div>
          </div>
        </main>
      </PageBackground>
    );
  }

  if (error || !data || !reportData) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto">
            <EmptyState icon={AlertCircle} title="报告不存在" description={error || "分享链接无效或已过期"} actionLabel="去首页" onAction={() => window.location.href = "/"} className="py-16" />
          </div>
        </main>
      </PageBackground>
    );
  }

  const { validation, aiAnalysis, evidenceGrade, proofResult, dimensions, radarData, xiaohongshuData } = reportData;
  const displayScore = aiAnalysis.feasibilityScore || validation.overall_score || 0;

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-fade-in mb-6 sm:mb-8">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2 sm:mb-3">
                <Sparkles className="w-3 h-3" />
                公开分享报告
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-2 sm:mb-3 break-words">
                {validation.idea.length > 40 ? `${validation.idea.slice(0, 40)}...` : validation.idea}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-base sm:text-lg leading-relaxed line-clamp-3">
                {aiAnalysis.overallVerdict || "AI 深度分析结论"}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {(validation.tags || []).map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-muted/50 border-border/50">#{tag}</Badge>
                ))}
                <Badge variant="outline" className="px-3 py-1 text-sm">证据等级 {evidenceGrade}</Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-full h-9" onClick={handleCopyLink}>
              <Share2 className="w-4 h-4 mr-2" />复制链接
            </Button>
          </div>

          {/* Score */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="lg:col-span-4 animate-slide-up">
              <ScoreHeroCard score={displayScore} totalNotes={xiaohongshuData.totalNotes} isIncomplete={false} />
            </div>
            <div className="lg:col-span-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <RadarDimensionSection radarData={radarData} dimensions={dimensions} />
            </div>
          </div>

          {/* Overview - read only */}
          <OverviewTab data={reportData} />

          {/* CTA to validate own idea */}
          <GlassCard className="mt-8 p-6 text-center">
            <Lock className="w-8 h-8 mx-auto mb-3 text-primary" />
            <h3 className="text-lg font-bold mb-2">想验证你自己的创业想法？</h3>
            <p className="text-muted-foreground text-sm mb-4">
              注册 IdeaScan，免费获得 AI 驱动的需求验证报告
            </p>
            <Button onClick={() => window.location.href = "/auth"} className="rounded-full">
              免费开始验证
            </Button>
          </GlassCard>
        </div>
      </main>
    </PageBackground>
  );
};

export default SharedReport;
