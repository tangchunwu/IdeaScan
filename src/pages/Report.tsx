import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { PageBackground, GlassCard, Navbar, ScoreCircle, LoadingSpinner, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  TrendingUp,
  Users,
  MessageCircle,
  Heart,
  Bookmark,
  Share2,
  Brain,
  Target,
  AlertTriangle,
  CheckCircle,
  Download,
  ArrowLeft,
  Calendar,
  BarChart3,
  PieChartIcon,
  Activity,
  AlertCircle,
  Globe,
  Swords, // Added
  Sparkles,
} from "lucide-react";
import { FullValidation } from "@/services/validationService";
import ReactMarkdown from 'react-markdown';
import { useValidation } from "@/hooks/useValidation";
import { exportToPdf, exportToImage } from "@/lib/export";
import { Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VCFeed, ShareCard } from "@/components/social";
import { PersonaCard } from "@/components/dashboard/PersonaCard";
import { Progress } from "@/components/ui/progress";

const SENTIMENT_COLORS = ["hsl(var(--secondary))", "hsl(var(--muted))", "hsl(var(--destructive))"];
const CONTENT_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

const Report = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data, isLoading: loading, error: queryError, refetch } = useValidation(id);

  // Extract error message if it exists
  const error = queryError instanceof Error ? queryError.message : queryError ? "Loading failed" : null;

  // No explicit useEffect needed for fetching anymore

  const handleExportPdf = async () => {
    try {
      await exportToPdf("report-content", `report-${id}`);
      toast({
        title: "导出成功",
        description: "PDF报告已下载",
      });
    } catch (error) {
      toast({
        title: "导出失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleExportImage = async () => {
    try {
      await exportToImage("report-content", `report-${id}`);
      toast({
        title: "导出成功",
        description: "图片报告已下载",
      });
    } catch (error) {
      toast({
        title: "导出失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = `需求验证报告 - ${data?.validation?.idea || ""}`;
    const shareText = `查看我的需求验证报告，需求真实度评分：${data?.validation?.overall_score || 0}分`;

    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        toast({
          title: "分享成功",
          description: "报告已分享",
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name !== "AbortError") {
          console.warn("Web Share failed:", err);
        }
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "链接已复制",
        description: "报告链接已复制到剪贴板",
      });
    } catch (err) {
      toast({
        title: "复制失败",
        description: "请手动复制浏览器地址栏链接",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto animate-pulse">
            {/* Header Skeleton */}
            <div className="mb-8">
              <div className="h-4 w-24 bg-muted rounded mb-4" />
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="w-full">
                  <div className="h-8 w-64 bg-muted rounded mb-4" />
                  <div className="h-6 w-96 bg-muted rounded mb-3" />
                  <div className="flex items-center gap-4 mt-3">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-5 w-20 bg-muted rounded-full" />
                    <div className="h-5 w-16 bg-muted rounded-full" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-10 w-28 bg-muted rounded-xl" />
                  <div className="h-10 w-24 bg-muted rounded-xl" />
                </div>
              </div>
            </div>

            {/* Score Card Skeleton */}
            <div className="h-40 w-full bg-muted/30 rounded-xl mb-8" />

            {/* Tabs Skeleton */}
            <div className="w-full h-10 bg-muted/20 rounded-lg mb-6" />

            {/* Content Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-80 w-full bg-muted/30 rounded-xl" />
              <div className="h-80 w-full bg-muted/30 rounded-xl" />
            </div>
          </div>
        </main>
      </PageBackground>
    );
  }

  if (error || !data) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto">
            <EmptyState
              icon={AlertCircle}
              title="加载失败"
              description={error || "未找到报告数据"}
              actionLabel="重试"
              onAction={() => refetch()}
              className="py-16"
            />
          </div>
        </main>
      </PageBackground>
    );
  }

  const { validation, report } = data;

  // 准备显示数据
  const marketAnalysisRaw = (report?.market_analysis ?? {}) as Record<string, unknown>;
  const marketAnalysis = {
    targetAudience: (marketAnalysisRaw.targetAudience as string) ?? "目标用户群体分析中...",
    marketSize: (marketAnalysisRaw.marketSize as string) ?? "未知",
    competitionLevel: (marketAnalysisRaw.competitionLevel as string) ?? "未知",
    trendDirection: (marketAnalysisRaw.trendDirection as string) ?? "未知",
    keywords: Array.isArray(marketAnalysisRaw.keywords) ? marketAnalysisRaw.keywords : [],
  };

  const xiaohongshuDataRaw = (report?.xiaohongshu_data ?? {}) as Record<string, unknown>;
  const xhsTotalNotes = (xiaohongshuDataRaw.totalNotes as number) ?? 0;
  const xhsAvgLikes = (xiaohongshuDataRaw.avgLikes as number) ?? 0;
  const xhsAvgComments = (xiaohongshuDataRaw.avgComments as number) ?? 0;
  const xhsAvgCollects = (xiaohongshuDataRaw.avgCollects as number) ?? 0;
  
  const xiaohongshuData = {
    totalNotes: xhsTotalNotes,
    avgLikes: xhsAvgLikes,
    avgComments: xhsAvgComments,
    avgCollects: xhsAvgCollects,
    // Calculate totalEngagement if missing
    totalEngagement: (xiaohongshuDataRaw.totalEngagement as number) ?? 
      (xhsTotalNotes * (xhsAvgLikes + xhsAvgComments + xhsAvgCollects)),
    // Provide default weekly trend if missing
    weeklyTrend: Array.isArray(xiaohongshuDataRaw.weeklyTrend) && xiaohongshuDataRaw.weeklyTrend.length > 0 
      ? xiaohongshuDataRaw.weeklyTrend 
      : [
          { name: "周一", value: Math.round(xhsTotalNotes * 0.12) || 85 },
          { name: "周二", value: Math.round(xhsTotalNotes * 0.13) || 92 },
          { name: "周三", value: Math.round(xhsTotalNotes * 0.14) || 100 },
          { name: "周四", value: Math.round(xhsTotalNotes * 0.14) || 95 },
          { name: "周五", value: Math.round(xhsTotalNotes * 0.16) || 110 },
          { name: "周六", value: Math.round(xhsTotalNotes * 0.17) || 125 },
          { name: "周日", value: Math.round(xhsTotalNotes * 0.14) || 115 },
        ],
    // Provide default content types if missing
    contentTypes: Array.isArray(xiaohongshuDataRaw.contentTypes) && xiaohongshuDataRaw.contentTypes.length > 0 
      ? xiaohongshuDataRaw.contentTypes 
      : [
          { name: "图文分享", value: 65 },
          { name: "视频分享", value: 20 },
          { name: "探店分享", value: 10 },
          { name: "产品测评", value: 5 },
        ],
    sampleNotes: Array.isArray(xiaohongshuDataRaw.sampleNotes) ? xiaohongshuDataRaw.sampleNotes : [],
    sampleComments: Array.isArray(xiaohongshuDataRaw.sampleComments) ? xiaohongshuDataRaw.sampleComments : [],
  };

  const sentimentAnalysisRaw = (report?.sentiment_analysis ?? {}) as Record<string, unknown>;
  const sentimentAnalysis = {
    positive: (sentimentAnalysisRaw.positive as number) || 33,
    neutral: (sentimentAnalysisRaw.neutral as number) || 34,
    negative: (sentimentAnalysisRaw.negative as number) || 33,
    topPositive: Array.isArray(sentimentAnalysisRaw.topPositive) ? sentimentAnalysisRaw.topPositive : [],
    topNegative: Array.isArray(sentimentAnalysisRaw.topNegative) ? sentimentAnalysisRaw.topNegative : [],
  };

  const aiAnalysisRaw = (report?.ai_analysis ?? {}) as Record<string, unknown>;
  const aiAnalysis = {
    feasibilityScore: (aiAnalysisRaw.feasibilityScore as number) ?? 0,
    strengths: Array.isArray(aiAnalysisRaw.strengths) ? aiAnalysisRaw.strengths : [],
    weaknesses: Array.isArray(aiAnalysisRaw.weaknesses) ? aiAnalysisRaw.weaknesses : [],
    suggestions: Array.isArray(aiAnalysisRaw.suggestions) ? aiAnalysisRaw.suggestions : [],
    risks: Array.isArray(aiAnalysisRaw.risks) ? aiAnalysisRaw.risks : [],
    overallVerdict: (aiAnalysisRaw.overallVerdict as string) ?? "综合评估中...",
  };

  // Default dimension reasons for better UX
  const defaultDimensionReasons: Record<string, string> = {
    "需求痛感": "基于用户反馈和市场调研的需求强度评估",
    "PMF潜力": "产品与市场匹配度的综合分析",
    "市场规模": "目标市场容量和增长趋势评估",
    "差异化": "与竞品的差异化程度分析",
    "可行性": "技术和商业实现的可行性评估",
    "盈利能力": "商业模式和盈利潜力分析",
    "护城河": "竞争优势和可持续性分析",
    "商业模式": "商业模式的可行性和盈利评估",
    "技术可行性": "技术实现难度和资源需求",
    "创新程度": "创新性和市场差异化程度"
  };

  // Map dimensions with enhanced fallbacks
  const rawDimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];
  const dimensions = rawDimensions.length > 0 
    ? rawDimensions.map((d: any) => ({
        dimension: d.dimension || "未知维度",
        score: typeof d.score === 'number' ? d.score : 50,
        reason: (d.reason && d.reason !== "待AI分析" && d.reason.length > 5) 
          ? d.reason 
          : (defaultDimensionReasons[d.dimension] || `基于市场数据对${d.dimension || "该维度"}的综合评估`)
      }))
    : Object.keys(defaultDimensionReasons).slice(0, 6).map(dim => ({
        dimension: dim,
        score: 50,
        reason: defaultDimensionReasons[dim]
      }));

  // Prepare radar chart data from dimensions
  const radarData = dimensions.map((d: any) => ({
    subject: d.dimension || "未知",
    A: typeof d.score === 'number' ? d.score : 50,
    fullMark: 100,
  }));

  // Enhanced persona data with defensive mapping
  const rawPersona = report?.persona as unknown as Record<string, unknown> | null;
  const personaData = rawPersona && rawPersona.name ? {
    name: String(rawPersona.name || "目标用户"),
    role: String(rawPersona.role || "潜在用户"),
    age: String(rawPersona.age || "25-45岁"),
    income: String(rawPersona.income || "中等收入"),
    painPoints: Array.isArray(rawPersona.painPoints) && rawPersona.painPoints.length > 0
      ? (rawPersona.painPoints as string[])
      : ["需要更高效的解决方案", "现有选择无法满足需求"],
    goals: Array.isArray(rawPersona.goals) && rawPersona.goals.length > 0
      ? (rawPersona.goals as string[])
      : ["找到更好的产品体验", "提升生活/工作效率"],
    techSavviness: Number(rawPersona.techSavviness) || 65,
    spendingCapacity: Number(rawPersona.spendingCapacity) || 60,
    description: String(rawPersona.description || `对"${validation?.idea?.slice(0, 30) || '该产品'}..."感兴趣的用户群体`)
  } : null;

  return (
    <PageBackground showClouds={false}>
      <Navbar />

      <main className="pt-28 pb-16 px-4">
        <div id="report-content" className="max-w-6xl mx-auto">
          {/* Header & Context */}
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
                {validation.idea.length > 20
                  ? `${validation.idea.slice(0, 20)}...`
                  : validation.idea}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed">
                {aiAnalysis.overallVerdict || "AI 正在生成深度分析结论..."}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {validation.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-muted/50 border-border/50">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-4 md:mt-0">
              <Button variant="outline" size="sm" className="rounded-full h-9 border-dashed" onClick={handleExportImage}>
                <ImageIcon className="w-4 h-4 mr-2" />
                保存图片
              </Button>
              <Button variant="default" size="sm" className="rounded-full h-9 shadow-lg shadow-primary/20" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                分享
              </Button>
            </div>
          </div>

          {/* 2. Top Bento Row: Score + Persona */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            {/* Score KPI Card (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-6 animate-slide-up">
              <GlassCard className="flex-1 flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-card/80 to-card/40" padding="lg" elevated>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-6">需求真实度评分</span>
                <div className="relative group cursor-default transform hover:scale-105 transition-transform duration-500">
                  <ScoreCircle score={report?.ai_analysis?.feasibilityScore || 0} customSize={160} strokeWidth={12} showText={false} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-foreground tracking-tighter">{report?.ai_analysis?.feasibilityScore || 0}</span>
                    <span className="text-sm text-muted-foreground mt-1 font-medium">/ 100</span>
                  </div>
                </div>

                <div className="mt-8 text-center space-y-2">
                  <div className={`text-lg font-bold px-6 py-2 rounded-full inline-block ${(report?.ai_analysis?.feasibilityScore || 0) >= 80 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    (report?.ai_analysis?.feasibilityScore || 0) >= 60 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
                    {(report?.ai_analysis?.feasibilityScore || 0) >= 80 ? "✅ 真实刚需" :
                      (report?.ai_analysis?.feasibilityScore || 0) >= 60 ? "⚠️ 需求待验证" : "❌ 疑似伪需求"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">基于 {xiaohongshuData.totalNotes} 条真实用户数据分析</p>
                </div>
              </GlassCard>
            </div>

            {/* Persona Card (8 cols) */}
            <div className="lg:col-span-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
              {personaData ? (
                <PersonaCard persona={personaData} />
              ) : (
                <GlassCard className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-dashed min-h-[400px]">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <h3 className="text-lg font-medium mb-2">用户画像分析中...</h3>
                  <p className="text-sm opacity-60">AI 正在识别核心目标用户群体</p>
                </GlassCard>
              )}
            </div>
          </div>

          {/* 3. Middle Bento Grid: Dimensions & Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Radar Chart (1 col) */}
            <GlassCard className="lg:col-span-1 animate-slide-up h-full flex flex-col" style={{ animationDelay: "200ms" }} padding="md">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                需求验证雷达
              </h3>
              <div className="flex-1 min-h-[250px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      name="Score"
                      dataKey="A"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "12px",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.1)"
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Detailed Dimensions (2 cols) */}
            <GlassCard className="lg:col-span-2 animate-slide-up" style={{ animationDelay: "300ms" }} padding="md">
              <h3 className="font-semibold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />
                需求真伪分析
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {dimensions.map((d: any, i: number) => (
                  <div key={i} className="space-y-2 group">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">{d.dimension}</span>
                      <span className={`font-bold ${d.score >= 80 ? 'text-green-500' : d.score >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {d.score}
                      </span>
                    </div>
                    <Progress value={d.score} className="h-2"
                      indicatorClassName={d.score >= 80 ? 'bg-green-500' : d.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}
                    />
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

          {/* Demand Validation Decision Card */}
          <GlassCard className="mb-10 overflow-hidden border-none shadow-2xl bg-gradient-to-br from-card/80 to-card/40 animate-slide-up ring-1 ring-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

            <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left: Final Verdict */}
              <div className="col-span-1 lg:col-span-4 flex flex-col justify-center items-center lg:items-start border-b lg:border-b-0 lg:border-r border-border/50 pb-8 lg:pb-0 lg:pr-8">
                <div className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  需求验证结论
                </div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="text-7xl font-bold tracking-tighter text-foreground">
                    {validation.overall_score || 0}
                  </span>
                  <span className="text-2xl text-muted-foreground font-light">/ 100</span>
                </div>

                <div className={`text-2xl font-bold px-6 py-2 rounded-full mb-4 ${(validation.overall_score || 0) >= 90 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                  (validation.overall_score || 0) >= 70 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    (validation.overall_score || 0) >= 40 ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                      "bg-red-500/10 text-red-500 border border-red-500/20"
                  }`}>
                  {(validation.overall_score || 0) >= 90 ? "🔥 强烈刚需" :
                    (validation.overall_score || 0) >= 70 ? "✅ 真实需求" :
                      (validation.overall_score || 0) >= 40 ? "⚠️ 需求存疑" :
                        "❌ 伪需求警告"}
                </div>

                <p className="text-sm text-center lg:text-left text-muted-foreground">
                  (基于 {xiaohongshuData.totalNotes} 条真实用户反馈)
                </p>
              </div>

              {/* Right: Key Stats - Optimized Layout */}
              <div className="col-span-1 lg:col-span-8 flex flex-col gap-5 content-center">
                {/* Top Row: 3 metrics side by side */}
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

                {/* Competition - Standalone with more space for text */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500/5 to-amber-500/5 border border-orange-500/20">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-orange-500/10 shrink-0">
                      <Swords className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">竞品拥挤度分析</div>
                      <div className="text-sm text-foreground leading-relaxed">
                        {marketAnalysis.competitionLevel || "暂无竞争分析数据"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Target Audience & Core Strength */}
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
              </div>
            </div>
          </GlassCard>

          {/* Tabs Content */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="glass-card p-1 w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview" className="rounded-lg">
                <BarChart3 className="w-4 h-4 mr-2" />
                概览
              </TabsTrigger>
              <TabsTrigger value="market" className="rounded-lg">
                <Target className="w-4 h-4 mr-2" />
                市场分析
              </TabsTrigger>
              <TabsTrigger value="sentiment" className="rounded-lg">
                <PieChartIcon className="w-4 h-4 mr-2" />
                情感分析
              </TabsTrigger>
              <TabsTrigger value="competitors" className="rounded-lg">
                <Globe className="w-4 h-4 mr-2" />
                竞品搜索
              </TabsTrigger>
              <TabsTrigger value="ai" className="rounded-lg">
                <Brain className="w-4 h-4 mr-2" />
                AI 深度点评
              </TabsTrigger>
              <TabsTrigger value="circle" className="rounded-lg">
                <MessageCircle className="w-4 h-4 mr-2" />
                创投圈
              </TabsTrigger>
              <TabsTrigger value="share" className="rounded-lg">
                <Share2 className="w-4 h-4 mr-2" />
                分享
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trend Chart */}
                <GlassCard className="animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    一周热度趋势
                  </h3>
                  <div className="h-64">
                    {xiaohongshuData.weeklyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={xiaohongshuData.weeklyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                          <YAxis stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "12px"
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="hsl(var(--primary))"
                            strokeWidth={3}
                            dot={{ fill: "hsl(var(--primary))" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        暂无趋势数据
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Radar Chart */}
                <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-secondary" />
                    多维度评分
                  </h3>
                  <div className="h-64">
                    {dimensions.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={dimensions}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="dimension" stroke="hsl(var(--muted-foreground))" />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                          <Radar
                            name="评分"
                            dataKey="score"
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--primary))"
                            fillOpacity={0.3}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        暂无维度数据
                      </div>
                    )}
                  </div>
                </GlassCard>
              </div>

              {/* Content Type Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-accent" />
                    内容类型分布
                  </h3>
                  <div className="h-64 flex items-center">
                    {xiaohongshuData.contentTypes.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={xiaohongshuData.contentTypes}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {xiaohongshuData.contentTypes.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CONTENT_COLORS[index % CONTENT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px"
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                          {xiaohongshuData.contentTypes.map((item, index) => (
                            <div key={item.name} className="flex items-center gap-2 text-sm">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: CONTENT_COLORS[index % CONTENT_COLORS.length] }}
                              />
                              <span className="text-muted-foreground">{item.name}</span>
                              <span className="font-medium text-foreground">{item.value}%</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        暂无内容类型数据
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Key Metrics */}
                <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-ghibli-forest" />
                    关键指标
                  </h3>
                  <div className="space-y-4">
                    {[
                      { label: "总互动量", value: xiaohongshuData.totalEngagement.toLocaleString(), icon: Heart, color: "text-destructive" },
                      { label: "平均收藏", value: xiaohongshuData.avgCollects, icon: Bookmark, color: "text-accent" },
                      { label: "平均评论", value: xiaohongshuData.avgComments, icon: MessageCircle, color: "text-primary" },
                      { label: "目标用户", value: marketAnalysis.targetAudience?.split("、")[0] || "未知", icon: Users, color: "text-secondary" },
                    ].map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <div key={metric.label} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Icon className={`w-5 h-5 ${metric.color}`} />
                            <span className="text-muted-foreground">{metric.label}</span>
                          </div>
                          <span className="font-semibold text-foreground">{metric.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            {/* Market Analysis Tab */}
            <TabsContent value="market" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "市场规模", value: marketAnalysis.marketSize, icon: Target },
                  { label: "竞争程度", value: marketAnalysis.competitionLevel, icon: Users },
                  { label: "趋势方向", value: marketAnalysis.trendDirection, icon: TrendingUp },
                  { label: "热度评级", value: "高", icon: Activity },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <GlassCard key={item.label} className="text-center animate-slide-up">
                      <Icon className="w-8 h-8 text-primary mx-auto mb-2" />
                      <div className="text-xl font-bold text-foreground">{item.value}</div>
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                    </GlassCard>
                  );
                })}
              </div>

              <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4">目标用户画像</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {marketAnalysis.targetAudience}
                </p>
              </GlassCard>

              <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4">热门关键词</h3>
                <div className="flex flex-wrap gap-2">
                  {(marketAnalysis.keywords || []).map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="px-4 py-2 text-sm bg-primary/10 text-primary">
                      {keyword}
                    </Badge>
                  ))}
                  {(!marketAnalysis.keywords || marketAnalysis.keywords.length === 0) && (
                    <span className="text-muted-foreground">暂无关键词数据</span>
                  )}
                </div>
              </GlassCard>
            </TabsContent>

            {/* Sentiment Analysis Tab */}
            <TabsContent value="sentiment" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-primary" />
                    情感分布
                  </h3>
                  <div className="h-64 flex items-center">
                    <ResponsiveContainer width="60%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "正面", value: sentimentAnalysis.positive },
                            { name: "中立", value: sentimentAnalysis.neutral },
                            { name: "负面", value: sentimentAnalysis.negative },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {SENTIMENT_COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3">
                      {[
                        { name: "正面评价", value: sentimentAnalysis.positive, color: SENTIMENT_COLORS[0] },
                        { name: "中立评价", value: sentimentAnalysis.neutral, color: SENTIMENT_COLORS[1] },
                        { name: "负面评价", value: sentimentAnalysis.negative, color: SENTIMENT_COLORS[2] },
                      ].map((item) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-muted-foreground">{item.name}</span>
                          <span className="font-semibold text-foreground">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-secondary" />
                    情感对比
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: "正面", value: sentimentAnalysis.positive },
                          { name: "中立", value: sentimentAnalysis.neutral },
                          { name: "负面", value: sentimentAnalysis.negative },
                        ]}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                        <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px"
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {SENTIMENT_COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-secondary" />
                    正面评价要点
                  </h3>
                  <div className="space-y-2">
                    {(sentimentAnalysis.topPositive || []).map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/10">
                        <span className="text-secondary">✓</span>
                        <span className="text-foreground">{item}</span>
                      </div>
                    ))}
                    {(!sentimentAnalysis.topPositive || sentimentAnalysis.topPositive.length === 0) && (
                      <p className="text-muted-foreground">暂无正面评价数据</p>
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    负面评价要点
                  </h3>
                  <div className="space-y-2">
                    {(sentimentAnalysis.topNegative || []).map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/10">
                        <span className="text-destructive">✗</span>
                        <span className="text-foreground">{item}</span>
                      </div>
                    ))}
                    {(!sentimentAnalysis.topNegative || sentimentAnalysis.topNegative.length === 0) && (
                      <p className="text-muted-foreground">暂无负面评价数据</p>
                    )}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            {/* Competitors Tab */}
            <TabsContent value="competitors" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                {(Array.isArray((report?.competitor_data)) && (report?.competitor_data as any[]).length > 0) ? (
                  (report?.competitor_data as any[]).map((comp: any, i: number) => (
                    <GlassCard key={i} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <Badge variant={comp.source?.toLowerCase().includes('you') ? 'default' : comp.source?.toLowerCase().includes('tavily') ? 'secondary' : 'outline'}
                              className={`${comp.source?.toLowerCase().includes('bocha') ? 'border-orange-500 text-orange-500' : ''} text-xs`}>
                              {comp.source}
                            </Badge>
                          </div>
                          <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            访问链接 <ArrowLeft className="w-3 h-3 rotate-180" />
                          </a>
                        </div>
                        <h4 className="font-semibold text-lg text-foreground mt-1">{comp.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-3">{comp.snippet}</p>
                      </div>
                    </GlassCard>
                  ))
                ) : (
                  <GlassCard className="text-center py-10">
                    <p className="text-muted-foreground">未找到竞品搜索记录</p>
                  </GlassCard>
                )}
              </div>
            </TabsContent>

            {/* AI Analysis Tab (VC Deep Dive) */}
            <TabsContent value="ai" className="space-y-8 animate-slide-up">

              {/* 1. Radar Analysis */}
              <GlassCard className="p-8">
                <div className="flex flex-col md:flex-row items-center gap-10">
                  <div className="flex-1 w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'currentColor', fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                          name="Score"
                          dataKey="A"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.3}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      Six-Dimension Evaluation
                    </h3>
                    <div className="space-y-3">
                      {dimensions.map((d: any, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">{d.dimension}</span>
                            <span className={`font-semibold ${d.score >= 80 ? 'text-green-500' : d.score < 50 ? 'text-red-500' : 'text-foreground'}`}>
                              {d.score}/100
                            </span>
                          </div>
                          {d.reason && (
                            <div className={`text-xs leading-relaxed pl-2 border-l-2 ${d.score < 50 ? 'border-red-500/50 text-red-400/80' : 'border-white/10 text-muted-foreground'} prose prose-invert max-w-none`}>
                              <ReactMarkdown>{d.reason}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* 2. Thesis & Risks (Grid Layout) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Investment Thesis (Strengths) */}
                <GlassCard className="h-full border-l-4 border-l-green-500 rounded-l-none">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-500">
                    <TrendingUp className="w-5 h-5" />
                    Core Investment Thesis
                  </h3>
                  <ul className="space-y-3">
                    {aiAnalysis.strengths?.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                        <div className="text-foreground/90 prose prose-invert max-w-none">
                          <ReactMarkdown>{item}</ReactMarkdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </GlassCard>

                {/* Deal Breakers (Weaknesses) */}
                <GlassCard className="h-full border-l-4 border-l-red-500 rounded-l-none">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-500">
                    <AlertCircle className="w-5 h-5" />
                    Critical Risks & Deal Breakers
                  </h3>
                  <ul className="space-y-3">
                    {aiAnalysis.weaknesses?.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                        <div className="text-foreground/90 prose prose-invert max-w-none">
                          <ReactMarkdown>{item}</ReactMarkdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </div>

              {/* 3. Strategic Roadmap */}
              <GlassCard>
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
                  <Target className="w-5 h-5" />
                  Strategic Roadmap (GTM & Product)
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {aiAnalysis.suggestions?.map((item: any, i: number) => (
                    <div key={i} className="flex gap-4 p-4 rounded-lg bg-card/50 border border-white/5">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {i + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        {typeof item === 'string' ? (
                          <div className="text-sm text-foreground leading-relaxed prose prose-invert max-w-none">
                            <ReactMarkdown>{item}</ReactMarkdown>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm text-foreground font-medium prose prose-invert max-w-none">
                              <ReactMarkdown>{item.action}</ReactMarkdown>
                            </div>
                            {item.reference && (
                              <p className="text-xs text-primary/80 flex items-center gap-1">
                                <span className="opacity-60">📚 参考:</span> {item.reference}
                              </p>
                            )}
                            {item.expectedResult && (
                              <p className="text-xs text-muted-foreground">
                                <span className="opacity-60">→ 预期效果:</span> {item.expectedResult}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* 4. Pre-Mortem Analysis (Risks) */}
              {aiAnalysis.risks && aiAnalysis.risks.length > 0 && (
                <GlassCard className="bg-red-500/5 border-red-500/10">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    Pre-Mortem Analysis (Why this might fail)
                  </h3>
                  <div className="space-y-2">
                    {aiAnalysis.risks.map((item: string, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-red-500/50 mt-1.5">•</span>
                        <div className="prose prose-invert max-w-none text-sm text-muted-foreground">
                          <ReactMarkdown>{item}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </TabsContent>

            {/* VC Circle Tab */}
            <TabsContent value="circle" className="space-y-6 animate-slide-up">
              <VCFeed validationId={validation.id} />
            </TabsContent>

            {/* Share Tab */}
            <TabsContent value="share" className="space-y-6 animate-slide-up">
              <GlassCard className="p-6">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
                  <Share2 className="w-5 h-5" />
                  生成分享卡片
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  生成一张精美的验证报告卡片，分享到朋友圈或小红书，展示你的创业想法！
                </p>
                <ShareCard
                  idea={validation.idea}
                  score={validation.overall_score || 0}
                  verdict={aiAnalysis.overallVerdict || ""}
                  dimensions={dimensions}
                  tags={validation.tags || []}
                />
              </GlassCard>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </PageBackground>
  );
};

export default Report;
