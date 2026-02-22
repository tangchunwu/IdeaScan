import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { PageBackground, GlassCard, Navbar, ScoreCircle, EmptyState, ChartSkeleton } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Tooltip,
} from "recharts";
import {
  TrendingUp, Users, MessageCircle, Brain, Target, Download, ArrowLeft,
  BarChart3, PieChartIcon, Activity, AlertCircle, Globe, Sparkles,
  RefreshCw, Loader2, Share2, Swords,
} from "lucide-react";
import { useValidation } from "@/hooks/useValidation";
import { exportToHTML, exportToMultiPagePdf } from "@/lib/export";
import { generateReportHTML, ReportData } from "@/lib/reportGenerator";
import { generatePDFHTML } from "@/lib/pdfGenerator";
import { FileText, FileCode, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import ReactMarkdown from "react-markdown";

// Extracted sub-components
import { useReportData, cleanDisplayText } from "@/components/report/useReportData";
import { CustomTooltip } from "@/components/report/CustomTooltip";
import { OverviewTab } from "@/components/report/OverviewTab";
import { MarketTab } from "@/components/report/MarketTab";
import { SentimentTab } from "@/components/report/SentimentTab";
import { CompetitorTab } from "@/components/report/CompetitorTab";
import { AIAnalysisTab } from "@/components/report/AIAnalysisTab";
import { ShareTab } from "@/components/report/ShareTab";

const Report = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data, isLoading: loading, error: queryError, refetch } = useValidation(id);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const settings = useSettings();

  const error = queryError instanceof Error ? queryError.message : queryError ? "Loading failed" : null;
  const reportData = useReportData(data);

  // Check if data needs re-analysis
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
    return personaIncomplete || dimensionsIncomplete;
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
        refetch();
      } else {
        toast({ title: "数据已完整", description: result?.message || "无需重新分析" });
      }
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

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      <main className="pt-28 pb-16 px-4">
        <div id="report-content" className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-fade-in mb-8">
            <div>
              <Link to="/history" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 transition-colors text-sm font-medium">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回历史记录
              </Link>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
                <Sparkles className="w-3 h-3" />
                需求验证报告 #{validation.id.slice(0, 8)}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-3">
                {validation.idea.length > 20 ? `${validation.idea.slice(0, 20)}...` : validation.idea}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed">
                {aiAnalysis.overallVerdict || "AI 正在生成深度分析结论..."}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {validation.tags.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-muted/50 border-border/50">#{tag}</Badge>
                ))}
                <Badge variant="outline" className="px-3 py-1 text-sm">证据等级 {evidenceGrade}</Badge>
                <Badge variant="outline" className="px-3 py-1 text-sm">商业可用性 {proofResult.verdict}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
              {needsReanalysis && (
                <Button variant="outline" size="sm" className="rounded-full h-9 border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={handleReanalyze} disabled={isReanalyzing}>
                  {isReanalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {isReanalyzing ? "分析中..." : "补充分析"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full h-9 border-dashed">
                    <Download className="w-4 h-4 mr-2" />下载报告<ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover border border-border z-50">
                  <DropdownMenuItem onClick={handleExportHTML} className="cursor-pointer">
                    <FileCode className="w-4 h-4 mr-2 text-primary" />
                    <div className="flex flex-col"><span>导出为 HTML</span><span className="text-xs text-muted-foreground">完整报告，可离线查看</span></div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2 text-red-500" />
                    <div className="flex flex-col"><span>导出为 PDF</span><span className="text-xs text-muted-foreground">多页完整报告</span></div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="default" size="sm" className="rounded-full h-9 shadow-lg shadow-primary/20" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />分享
              </Button>
            </div>
          </div>

          {/* Score + Persona Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            <div className="lg:col-span-4 flex flex-col gap-6 animate-slide-up">
              <GlassCard className="flex-1 flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40" padding="lg" elevated>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-6">需求真实度评分</span>
                <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
                  <ScoreCircle score={aiAnalysis.feasibilityScore || 0} customSize={160} strokeWidth={12} showText={false} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-foreground tracking-tighter">{aiAnalysis.feasibilityScore || 0}</span>
                    <span className="text-sm text-muted-foreground mt-1 font-medium">/ 100</span>
                  </div>
                </div>
                <div className="mt-8 text-center space-y-2">
                  <div className={`text-lg font-bold px-6 py-2 rounded-full inline-block ${(aiAnalysis.feasibilityScore || 0) >= 80 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    (aiAnalysis.feasibilityScore || 0) >= 60 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
                    {(aiAnalysis.feasibilityScore || 0) >= 80 ? "✅ 真实刚需" : (aiAnalysis.feasibilityScore || 0) >= 60 ? "⚠️ 需求待验证" : "❌ 疑似伪需求"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">基于 {xiaohongshuData.totalNotes} 条真实用户数据分析</p>
                </div>
              </GlassCard>
            </div>
            <div className="lg:col-span-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
              {personaData ? (
                <PersonaCard persona={personaData} />
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

          {/* Radar + Dimensions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <GlassCard className="lg:col-span-1 animate-slide-up h-full flex flex-col" style={{ animationDelay: "200ms" }} padding="md">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />需求验证雷达
              </h3>
              <div className="flex-1 min-h-[250px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" strokeWidth={3} fill="hsl(var(--primary))" fillOpacity={0.2} />
                    <Tooltip content={<CustomTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="lg:col-span-2 animate-slide-up" style={{ animationDelay: "300ms" }} padding="md">
              <h3 className="font-semibold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />需求真伪分析
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {dimensions.map((d: any, i: number) => (
                  <div key={i} className="space-y-2 group">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">{d.dimension}</span>
                      <span className={`font-bold ${d.score >= 80 ? 'text-green-500' : d.score >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>{d.score}</span>
                    </div>
                    <Progress value={d.score} className="h-2" indicatorClassName={d.score >= 80 ? 'bg-green-500' : d.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'} />
                    {d.reason && (
                      <div className="text-xs text-muted-foreground/80 leading-relaxed pl-2 border-l-2 border-border mt-1.5 prose prose-invert max-w-none line-clamp-2 hover:line-clamp-none transition-all">
                        <ReactMarkdown>{d.reason}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Demand Decision Card */}
          <GlassCard className="mb-10 overflow-hidden border-none shadow-2xl bg-gradient-to-br from-card/80 to-card/40 animate-slide-up ring-1 ring-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="col-span-1 lg:col-span-4 flex flex-col justify-center items-center lg:items-start border-b lg:border-b-0 lg:border-r border-border/50 pb-8 lg:pb-0 lg:pr-8">
                <div className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">需求验证结论</div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="text-7xl font-bold tracking-tighter text-foreground">{validation.overall_score || 0}</span>
                  <span className="text-2xl text-muted-foreground font-light">/ 100</span>
                </div>
                <div className={`text-2xl font-bold px-6 py-2 rounded-full mb-4 ${(validation.overall_score || 0) >= 90 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                  (validation.overall_score || 0) >= 70 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    (validation.overall_score || 0) >= 40 ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                      "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
                  {(validation.overall_score || 0) >= 90 ? "🔥 强烈刚需" :
                    (validation.overall_score || 0) >= 70 ? "✅ 真实需求" :
                      (validation.overall_score || 0) >= 40 ? "⚠️ 需求存疑" : "❌ 伪需求警告"}
                </div>
                <p className="text-sm text-center lg:text-left text-muted-foreground">(基于 {xiaohongshuData.totalNotes} 条真实用户反馈)</p>
              </div>
              <div className="col-span-1 lg:col-span-8 flex flex-col gap-5 content-center">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">用户讨论量</div>
                    <div className="text-2xl font-semibold">{xiaohongshuData.totalNotes.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">条</span></div>
                  </div>
                  <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">用户互动热度</div>
                    <div className="text-2xl font-semibold">{xiaohongshuData.totalEngagement.toLocaleString()}</div>
                  </div>
                  <div className="space-y-1 p-4 rounded-xl bg-muted/30 border border-border/30">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">用户态度</div>
                    <div className={`text-2xl font-semibold ${sentimentAnalysis.positive > 60 ? 'text-green-500' : 'text-foreground'}`}>
                      {sentimentAnalysis.positive}% <span className="text-sm text-muted-foreground font-normal">正向</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500/5 to-amber-500/5 border border-orange-500/20">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-orange-500/10 shrink-0"><Swords className="w-5 h-5 text-orange-500" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">竞品拥挤度分析</div>
                      <div className="text-sm text-foreground leading-relaxed">{marketAnalysis.competitionLevel || "暂无竞争分析数据"}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/5 border border-secondary/10">
                    <Target className="w-5 h-5 text-secondary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">目标用户</div>
                      <div className="text-sm font-medium line-clamp-2">{marketAnalysis.targetAudience}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <Brain className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">核心痛点</div>
                      <div className="text-sm font-medium line-clamp-2">{aiAnalysis.strengths?.[0] || "-"}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="text-xs text-muted-foreground mb-1">市场信号结论</div>
                    <div className="text-sm font-medium">{aiAnalysis.overallVerdict}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <div className="text-xs text-muted-foreground mb-1">商业可用性结论（付费意图）</div>
                    <div className="text-sm font-medium">
                      {proofResult.verdict} · 付费意图 {Math.round(proofResult.paidIntentRate * 100)}% · Waitlist {Math.round(proofResult.waitlistRate * 100)}% · UV {proofResult.sampleUv}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="text-xs text-muted-foreground mb-1">本次分析成本</div>
                    <div className="text-sm font-medium">
                      ${costBreakdown.estCost.toFixed(4)} · LLM {costBreakdown.llmCalls} 次 · API {costBreakdown.externalApiCalls} 次 · Crawler {costBreakdown.crawlerCalls} 次
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Prompt {costBreakdown.promptTokens} · Completion {costBreakdown.completionTokens} · 总耗时 {Math.round(costBreakdown.latencyMs / 1000)}s · Crawler耗时 {Math.round(costBreakdown.crawlerLatencyMs / 1000)}s
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
                  <div className="text-xs text-muted-foreground mb-1">结论证据摘要</div>
                  <div className="text-sm font-medium">
                    {topEvidence.length > 0 ? topEvidence.join(" · ") : "当前样本不足，建议增加关键词并重跑验证"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                  <div className="text-xs text-muted-foreground mb-2">证据溯源（可点击）</div>
                  {evidenceItems.length > 0 ? (
                    <div className="space-y-2">
                      {evidenceItems.slice(0, 6).map((item, idx) => (
                        <div key={`${item.type}-${idx}`} className="text-sm flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              [{item.type === "note" ? "笔记" : item.type === "comment" ? "评论" : "竞品"}] {item.title}
                            </div>
                            {item.snippet && <div className="text-xs text-muted-foreground truncate">{item.snippet}</div>}
                          </div>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">查看来源</a>
                          ) : (
                            <div className="flex items-center gap-2 shrink-0">
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">展开原文</summary>
                                <div className="mt-1 max-w-[280px] break-words text-muted-foreground">{item.fullText || item.snippet || "无内容"}</div>
                              </details>
                              <button type="button" className="text-xs text-primary hover:underline" onClick={async () => {
                                const content = item.fullText || item.snippet || "";
                                if (!content) return;
                                try { await navigator.clipboard.writeText(content); toast({ title: "已复制证据原文" }); }
                                catch { toast({ title: "复制失败", description: "请手动复制", variant: "destructive" }); }
                              }}>复制</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">暂无可展示证据</div>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Tabs - Lazy rendered */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="glass-card p-1 w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview" className="rounded-lg"><BarChart3 className="w-4 h-4 mr-2" />概览</TabsTrigger>
              <TabsTrigger value="insights" className="rounded-lg"><Sparkles className="w-4 h-4 mr-2" />数据洞察</TabsTrigger>
              <TabsTrigger value="market" className="rounded-lg"><Target className="w-4 h-4 mr-2" />市场分析</TabsTrigger>
              <TabsTrigger value="sentiment" className="rounded-lg"><PieChartIcon className="w-4 h-4 mr-2" />情感分析</TabsTrigger>
              <TabsTrigger value="competitors" className="rounded-lg"><Globe className="w-4 h-4 mr-2" />竞品搜索</TabsTrigger>
              <TabsTrigger value="ai" className="rounded-lg"><Brain className="w-4 h-4 mr-2" />AI 深度点评</TabsTrigger>
              <TabsTrigger value="circle" className="rounded-lg"><MessageCircle className="w-4 h-4 mr-2" />创投圈</TabsTrigger>
              <TabsTrigger value="share" className="rounded-lg"><Share2 className="w-4 h-4 mr-2" />分享</TabsTrigger>
            </TabsList>

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
