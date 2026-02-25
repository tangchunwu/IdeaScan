import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { PageBackground, GlassCard, Navbar, ScoreCircle, EmptyState, ChartSkeleton } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, Users, MessageCircle, Brain, Target,
  BarChart3, PieChartIcon, Activity, AlertCircle, Globe, Sparkles,
  RefreshCw, Loader2, Share2,
} from "lucide-react";
import { useValidation } from "@/hooks/useValidation";
import { exportToHTML, exportToMultiPagePdf } from "@/lib/export";
import { generateReportHTML, ReportData } from "@/lib/reportGenerator";
import { generatePDFHTML } from "@/lib/pdfGenerator";
import { useToast } from "@/hooks/use-toast";
import { VCFeed } from "@/components/social";
import { PersonaCard } from "@/components/dashboard/PersonaCard";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";
import { DataInsightsTab } from "@/components/report/DataInsightsTab";
import { ActionRecommendation } from "@/components/report/ActionRecommendation";
import { DataConfidenceCard } from "@/components/report/DataConfidenceCard";
import { DevPanel } from "@/components/report/DevPanel";
import { captureEvent } from "@/lib/posthog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Extracted sub-components
import { useReportData, cleanDisplayText } from "@/components/report/useReportData";
import { OverviewTab } from "@/components/report/OverviewTab";
import { MarketTab } from "@/components/report/MarketTab";
import { SentimentTab } from "@/components/report/SentimentTab";
import { CompetitorTab } from "@/components/report/CompetitorTab";
import { AIAnalysisTab } from "@/components/report/AIAnalysisTab";
import { ShareTab } from "@/components/report/ShareTab";
import { ReportHeader } from "@/components/report/ReportHeader";
import { ScoreHeroCard } from "@/components/report/ScoreHeroCard";
import { RadarDimensionSection } from "@/components/report/RadarDimensionSection";
import { DemandDecisionCard } from "@/components/report/DemandDecisionCard";

const Report = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading: loading, error: queryError, refetch } = useValidation(id);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const settings = useSettings();

  const error = queryError instanceof Error ? queryError.message : queryError ? "Loading failed" : null;
  const reportData = useReportData(data);

  const checkNeedsReanalysis = () => {
    if (!data?.report) return false;
    const report = data.report;
    const personaIncomplete = !report.persona ||
      !(report.persona as any)?.name ||
      !(report.persona as any)?.role ||
      ((report.persona as any)?.description?.includes("分析中"));
    const dimensions = Array.isArray(report.dimensions) ? report.dimensions : [];
    const dimensionsIncomplete = dimensions.length === 0 ||
      dimensions.some((d: any) =>
        !d.reason || d.reason === "待AI分析" || d.reason.includes("数据加载中") ||
        (d.reason.length < 15 && !d.reason.includes("评估"))
      );
    // Also check if AI analysis is incomplete
    const ai = (report.ai_analysis ?? {}) as Record<string, unknown>;
    const aiIncomplete = !ai.overallVerdict ||
      String(ai.overallVerdict).includes("综合评估中") ||
      String(ai.overallVerdict).includes("正在生成") ||
      !Array.isArray(ai.strengths) || (ai.strengths as unknown[]).length === 0 ||
      !Array.isArray(ai.weaknesses) || (ai.weaknesses as unknown[]).length === 0;
    return personaIncomplete || dimensionsIncomplete || aiIncomplete;
  };

  const needsReanalysis = data?.report ? checkNeedsReanalysis() : false;

  useEffect(() => {
    if (data?.validation && !loading) {
      captureEvent('report_viewed', {
        validation_id: id,
        score: data.validation.overall_score,
        idea_preview: data.validation.idea.substring(0, 50),
      });
    }
  }, [data?.validation?.id, loading]);

  const handleReanalyze = async () => {
    if (!id || isReanalyzing) return;
    setIsReanalyzing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('re-analyze-validation', {
        body: {
          validationId: id,
          config: {
            llmProvider: settings.llmProvider,
            llmBaseUrl: settings.llmBaseUrl,
            llmApiKey: settings.llmApiKey,
            llmModel: settings.llmModel,
            llmFallbacks: settings.llmFallbacks,
          }
        }
      });
      if (error) throw error;
      if (result?.updated) {
        toast({ title: "分析完成", description: `已更新: ${result.updatedFields?.join(", ") || "数据"}` });
      } else {
        toast({ title: "数据已完整", description: result?.message || "无需重新分析" });
      }
      // Always refetch to ensure UI shows latest data from DB
      refetch();
    } catch (error) {
      console.error("Re-analyze error:", error);
      toast({ title: "分析失败", description: (error as Error).message || "请稍后重试", variant: "destructive" });
    } finally {
      setIsReanalyzing(false);
    }
  };

  const prepareExportData = (): ReportData | null => {
    if (!reportData) return null;
    const { validation, aiAnalysis, marketAnalysis, sentimentAnalysis, xiaohongshuData, dimensions, personaData } = reportData;
    return {
      id: validation.id,
      idea: validation.idea,
      score: aiAnalysis.feasibilityScore ?? validation.overall_score ?? 0,
      verdict: aiAnalysis.overallVerdict,
      tags: validation.tags || [],
      createdAt: validation.created_at,
      dimensions: dimensions.map((d: any) => ({ dimension: d.dimension, score: d.score, reason: d.reason })),
      persona: personaData ? {
        name: personaData.name, role: personaData.role, age: personaData.age,
        income: personaData.income, painPoints: personaData.painPoints,
        goals: personaData.goals, techSavviness: personaData.techSavviness,
        spendingCapacity: personaData.spendingCapacity, description: personaData.description,
      } : null,
      marketAnalysis,
      sentiment: sentimentAnalysis,
      xiaohongshu: {
        totalNotes: xiaohongshuData.totalNotes,
        totalEngagement: xiaohongshuData.totalEngagement,
        avgLikes: xiaohongshuData.avgLikes,
        avgComments: xiaohongshuData.avgComments,
        avgCollects: xiaohongshuData.avgCollects,
      },
      aiAnalysis,
    };
  };

  const handleExportHTML = () => {
    const rd = prepareExportData();
    if (!rd) { toast({ title: "导出失败", description: "报告数据未加载完成", variant: "destructive" }); return; }
    try {
      const htmlContent = generateReportHTML(rd);
      const ideaSlice = rd.idea.slice(0, 10).replace(/[/\\?%*:|"<>]/g, '');
      const dateStr = new Date().toISOString().split('T')[0];
      exportToHTML(htmlContent, `需求验证报告_${ideaSlice}_${dateStr}`);
      captureEvent('report_exported', { validation_id: id, format: 'html' });
      toast({ title: "导出成功", description: "HTML 完整报告已下载，可离线查看" });
    } catch { toast({ title: "导出失败", description: "请稍后重试", variant: "destructive" }); }
  };

  const handleExportPdf = async () => {
    const rd = prepareExportData();
    if (!rd) { toast({ title: "导出失败", description: "报告数据未加载完成", variant: "destructive" }); return; }
    try {
      const pdfHtml = generatePDFHTML(rd);
      const ideaSlice = rd.idea.slice(0, 10).replace(/[/\\?%*:|"<>]/g, '');
      const dateStr = new Date().toISOString().split('T')[0];
      await exportToMultiPagePdf(pdfHtml, `需求验证报告_${ideaSlice}_${dateStr}`);
      captureEvent('report_exported', { validation_id: id, format: 'pdf' });
      toast({ title: "导出成功", description: "多页 PDF 报告已下载" });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({ title: "导出失败", description: "请稍后重试", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = `需求验证报告 - ${data?.validation?.idea || ""}`;
    const shareText = `查看我的需求验证报告，需求真实度评分：${data?.validation?.overall_score || 0}分`;
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        captureEvent('report_shared', { validation_id: id, method: 'native_share' });
        toast({ title: "分享成功", description: "报告已分享" });
        return;
      } catch (err) { if ((err as Error).name !== "AbortError") console.warn("Web Share failed:", err); }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      captureEvent('report_shared', { validation_id: id, method: 'clipboard' });
      toast({ title: "链接已复制", description: "报告链接已复制到剪贴板" });
    } catch { toast({ title: "复制失败", description: "请手动复制浏览器地址栏链接", variant: "destructive" }); }
  };

  // Loading state
  if (loading) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
                <Skeleton className="h-10 w-64 md:w-96 rounded-lg" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded" />
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4">
                <GlassCard className="h-full min-h-[300px] flex flex-col justify-center items-center">
                  <Skeleton className="w-32 h-32 rounded-full mb-6" />
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </GlassCard>
              </div>
              <Skeleton className="lg:col-span-8 h-[300px] rounded-3xl" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 h-[300px]"><ChartSkeleton /></div>
              <GlassCard className="lg:col-span-2 h-[300px] p-6 space-y-4">
                <div className="flex justify-between"><Skeleton className="h-6 w-32" /><Skeleton className="h-6 w-12" /></div>
                <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              </GlassCard>
            </div>
            <Skeleton className="h-[200px] w-full rounded-2xl" />
          </div>
        </main>
      </PageBackground>
    );
  }

  // Error state
  if (error || !data || !reportData) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto">
            <EmptyState icon={AlertCircle} title="加载失败" description={error || "未找到报告数据"} actionLabel="重试" onAction={() => refetch()} className="py-16" />
          </div>
        </main>
      </PageBackground>
    );
  }

  const { validation, report, marketAnalysis, xiaohongshuData, sentimentAnalysis, aiAnalysis,
    evidenceGrade, proofResult, costBreakdown, dimensions, radarData, personaData,
    competitorRows, evidenceItems, topEvidence } = reportData;

  const isIncomplete = validation.status === 'failed' || validation.status === 'processing' || (validation as any).resumable === true;
  const displayScore = aiAnalysis.feasibilityScore || validation.overall_score || 0;

  const handleResume = () => {
    const idea = encodeURIComponent(validation.idea);
    navigate(`/validate?idea=${idea}&auto=true&resumeValidationId=${validation.id}`);
  };

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      <main className="pt-28 pb-16 px-4">
        <div id="report-content" className="max-w-6xl mx-auto">
          <ReportHeader
            validation={validation}
            aiAnalysis={aiAnalysis}
            evidenceGrade={evidenceGrade}
            proofResult={proofResult}
            needsReanalysis={needsReanalysis}
            isReanalyzing={isReanalyzing}
            isIncomplete={isIncomplete}
            onReanalyze={handleReanalyze}
            onResume={handleResume}
            onExportHTML={handleExportHTML}
            onExportPdf={handleExportPdf}
            onShare={handleShare}
          />

          {/* Incomplete Report Banner */}
          {isIncomplete && (
            <Alert className="mb-8 border-amber-500/50 bg-amber-500/5 animate-fade-in">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-500">验证未完成</AlertTitle>
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-muted-foreground">本次验证中途中断，部分数据尚未采集完成。您可以继续验证以补全分析结果。</span>
                <Button variant="outline" size="sm" className="rounded-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10 shrink-0" onClick={handleResume}>
                  <RefreshCw className="w-4 h-4 mr-2" />继续验证
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Score + Persona Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            <div className="lg:col-span-4 flex flex-col gap-6 animate-slide-up">
              <ScoreHeroCard score={displayScore} totalNotes={xiaohongshuData.totalNotes} isIncomplete={isIncomplete} />
            </div>
            <div className="lg:col-span-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
              {personaData ? (
                <PersonaCard persona={personaData} validationId={validation.id} />
              ) : (
                <GlassCard className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-dashed min-h-[400px]">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <h3 className="text-lg font-medium mb-2">用户画像数据缺失</h3>
                  <p className="text-sm opacity-60 mb-4">点击下方按钮补充 AI 分析</p>
                  <Button variant="outline" size="sm" className="rounded-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={handleReanalyze} disabled={isReanalyzing}>
                    {isReanalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    {isReanalyzing ? "分析中..." : "补充分析用户画像"}
                  </Button>
                </GlassCard>
              )}
            </div>
          </div>

          {/* Action Recommendation & Data Confidence */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 animate-slide-up" style={{ animationDelay: "150ms" }}>
              <ActionRecommendation
                score={validation.overall_score || 0}
                strengths={aiAnalysis.strengths || []}
                weaknesses={aiAnalysis.weaknesses || []}
                sentiment={{ positive: sentimentAnalysis.positive, negative: sentimentAnalysis.negative }}
                onValidateMore={() => window.location.href = '/validate'}
                onStartBuilding={() => { captureEvent('start_building_clicked', { validation_id: validation.id }); window.open('https://lovable.dev', '_blank'); }}
              />
            </div>
            <div className="lg:col-span-1 animate-slide-up" style={{ animationDelay: "200ms" }}>
              <DataConfidenceCard
                sampleSize={xiaohongshuData.totalNotes || 0}
                platforms={[
                  { name: "小红书", count: xiaohongshuData.totalNotes || 0 },
                  ...((report?.data_summary as any)?.douyin?.totalVideos ? [{ name: "抖音", count: (report.data_summary as any).douyin.totalVideos }] : []),
                ]}
                dataFreshness="fresh"
                className="h-full"
              />
            </div>
          </div>

          <RadarDimensionSection radarData={radarData} dimensions={dimensions} />

          <DemandDecisionCard
            validation={validation}
            score={displayScore}
            xiaohongshuData={xiaohongshuData}
            sentimentAnalysis={sentimentAnalysis}
            marketAnalysis={marketAnalysis}
            aiAnalysis={aiAnalysis}
            proofResult={proofResult}
            costBreakdown={costBreakdown}
            topEvidence={topEvidence}
            evidenceItems={evidenceItems}
          />

          {/* Tabs - Lazy rendered */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="relative">
              <TabsList className="glass-card p-1 w-full justify-start overflow-x-auto scrollbar-hide">
                <TabsTrigger value="overview" className="rounded-lg"><BarChart3 className="w-4 h-4 mr-2" />概览</TabsTrigger>
                <TabsTrigger value="insights" className="rounded-lg"><Sparkles className="w-4 h-4 mr-2" />数据洞察</TabsTrigger>
                <TabsTrigger value="market" className="rounded-lg"><Target className="w-4 h-4 mr-2" />市场分析</TabsTrigger>
                <TabsTrigger value="sentiment" className="rounded-lg"><PieChartIcon className="w-4 h-4 mr-2" />情感分析</TabsTrigger>
                <TabsTrigger value="competitors" className="rounded-lg"><Globe className="w-4 h-4 mr-2" />竞品搜索</TabsTrigger>
                <TabsTrigger value="ai" className="rounded-lg"><Brain className="w-4 h-4 mr-2" />AI 深度点评</TabsTrigger>
                <TabsTrigger value="circle" className="rounded-lg"><MessageCircle className="w-4 h-4 mr-2" />创投圈</TabsTrigger>
                <TabsTrigger value="share" className="rounded-lg"><Share2 className="w-4 h-4 mr-2" />分享</TabsTrigger>
              </TabsList>
              {/* Fade hint for scroll on mobile */}
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
            </div>

            <TabsContent value="overview">{activeTab === "overview" && <OverviewTab data={reportData} />}</TabsContent>
            <TabsContent value="insights">{activeTab === "insights" && <DataInsightsTab dataSummary={report?.data_summary as any} dataQualityScore={report?.data_quality_score ?? undefined} keywordsUsed={report?.keywords_used as any} />}</TabsContent>
            <TabsContent value="market">{activeTab === "market" && <MarketTab data={reportData} />}</TabsContent>
            <TabsContent value="sentiment">{activeTab === "sentiment" && <SentimentTab data={reportData} />}</TabsContent>
            <TabsContent value="competitors">{activeTab === "competitors" && <CompetitorTab data={reportData} />}</TabsContent>
            <TabsContent value="ai">{activeTab === "ai" && <AIAnalysisTab data={reportData} />}</TabsContent>
            <TabsContent value="circle">{activeTab === "circle" && <VCFeed validationId={validation.id} />}</TabsContent>
            <TabsContent value="share">{activeTab === "share" && <ShareTab data={reportData} />}</TabsContent>
          </Tabs>

          <DevPanel report={report} validationId={validation.id} />
        </div>
      </main>
    </PageBackground>
  );
};

export default Report;
