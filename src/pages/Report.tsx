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
} from "lucide-react";
import { FullValidation } from "@/services/validationService";
import { useValidation } from "@/hooks/useValidation";
import { exportToPdf, exportToImage } from "@/lib/export";
import { Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    const shareTitle = `商业创意验证报告 - ${data?.validation?.idea || ""}`;
    const shareText = `查看我的商业创意验证报告，综合评分：${data?.validation?.overall_score || 0}分`;

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
    targetAudience: (marketAnalysisRaw.targetAudience as string) ?? "暂无数据",
    marketSize: (marketAnalysisRaw.marketSize as string) ?? "未知",
    competitionLevel: (marketAnalysisRaw.competitionLevel as string) ?? "未知",
    trendDirection: (marketAnalysisRaw.trendDirection as string) ?? "未知",
    keywords: Array.isArray(marketAnalysisRaw.keywords) ? marketAnalysisRaw.keywords : [],
  };

  const xiaohongshuDataRaw = (report?.xiaohongshu_data ?? {}) as Record<string, unknown>;
  const xiaohongshuData = {
    totalNotes: (xiaohongshuDataRaw.totalNotes as number) ?? 0,
    avgLikes: (xiaohongshuDataRaw.avgLikes as number) ?? 0,
    avgComments: (xiaohongshuDataRaw.avgComments as number) ?? 0,
    avgCollects: (xiaohongshuDataRaw.avgCollects as number) ?? 0,
    totalEngagement: (xiaohongshuDataRaw.totalEngagement as number) ?? 0,
    weeklyTrend: Array.isArray(xiaohongshuDataRaw.weeklyTrend) ? xiaohongshuDataRaw.weeklyTrend : [],
    contentTypes: Array.isArray(xiaohongshuDataRaw.contentTypes) ? xiaohongshuDataRaw.contentTypes : [],
    sampleNotes: Array.isArray(xiaohongshuDataRaw.sampleNotes) ? xiaohongshuDataRaw.sampleNotes : [],
    sampleComments: Array.isArray(xiaohongshuDataRaw.sampleComments) ? xiaohongshuDataRaw.sampleComments : [],
  };

  const sentimentAnalysisRaw = (report?.sentiment_analysis ?? {}) as Record<string, unknown>;
  const sentimentAnalysis = {
    positive: (sentimentAnalysisRaw.positive as number) ?? 0,
    neutral: (sentimentAnalysisRaw.neutral as number) ?? 0,
    negative: (sentimentAnalysisRaw.negative as number) ?? 0,
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
  };

  const dimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];

  // Prepare radar chart data from dimensions
  const radarData = dimensions.map((d: any) => ({
    subject: d.dimension,
    A: d.score,
    fullMark: 100,
  }));

  return (
    <PageBackground showClouds={false}>
      <Navbar />

      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          {/* Header */}
          <div className="mb-10 animate-fade-in">
            <Link to="/history" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors text-sm font-medium">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回历史记录
            </Link>

            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 px-3 py-1">
                    Investment Memo #{validation.id.slice(0, 8)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Generated: {new Date(validation.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
                  {validation.idea}
                </h1>

                <div className="flex flex-wrap gap-2">
                  {validation.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-muted/50">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" className="rounded-xl border-dashed" onClick={handleExportImage}>
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Save Image
                </Button>
                <Button variant="default" className="rounded-xl shadow-lg shadow-primary/20" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Memo
                </Button>
              </div>
            </div>
          </div>

          {/* Investment Decision Card */}
          <GlassCard className="mb-10 overflow-hidden border-none shadow-2xl bg-gradient-to-br from-card/80 to-card/40 animate-slide-up ring-1 ring-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

            <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left: Final Verdict */}
              <div className="col-span-1 lg:col-span-4 flex flex-col justify-center items-center lg:items-start border-b lg:border-b-0 lg:border-r border-border/50 pb-8 lg:pb-0 lg:pr-8">
                <div className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  Investment Verdict
                </div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="text-7xl font-bold tracking-tighter text-foreground">
                    {validation.overall_score || 0}
                  </span>
                  <span className="text-2xl text-muted-foreground font-light">/ 100</span>
                </div>

                <div className={`text-2xl font-bold px-6 py-2 rounded-full mb-4 ${(validation.overall_score || 0) >= 90 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                  (validation.overall_score || 0) >= 70 ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    (validation.overall_score || 0) >= 40 ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                      "bg-red-500/10 text-red-500 border border-red-500/20"
                  }`}>
                  {(validation.overall_score || 0) >= 90 ? "🦄 UNICORN POTENTIAL" :
                    (validation.overall_score || 0) >= 70 ? "🚀 INVESTABLE" :
                      (validation.overall_score || 0) >= 40 ? "⚠️ WATCHLIST" :
                        "⛔ PASS"}
                </div>

                <p className="text-sm text-center lg:text-left text-muted-foreground">
                  (Based on {xiaohongshuData.totalNotes} market signals)
                </p>
              </div>

              {/* Right: Key Stats */}
              <div className="col-span-1 lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-6 content-center">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Market Interest</div>
                  <div className="text-2xl font-semibold">{xiaohongshuData.totalNotes.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">Notes</span></div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">User Engagement</div>
                  <div className="text-2xl font-semibold">{xiaohongshuData.totalEngagement.toLocaleString()}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Sentiment Score</div>
                  <div className={`text-2xl font-semibold ${sentimentAnalysis.positive > 60 ? 'text-green-500' : 'text-foreground'}`}>
                    {sentimentAnalysis.positive}% <span className="text-sm text-muted-foreground font-normal">Pos</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Competition</div>
                  <div className="text-2xl font-semibold">{marketAnalysis.competitionLevel || "Unknown"}</div>
                </div>

                <div className="col-span-2 md:col-span-4 h-px bg-border/50 my-2" />

                <div className="col-span-2 md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/5 border border-secondary/10">
                    <Target className="w-5 h-5 text-secondary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Target Audience</div>
                      <div className="text-sm font-medium line-clamp-1">{marketAnalysis.targetAudience}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <Brain className="w-5 h-5 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Core Strength</div>
                      <div className="text-sm font-medium line-clamp-1">{aiAnalysis.strengths?.[0] || "-"}</div>
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
                VC 深度点评
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
                          <Badge variant="outline" className="text-xs">
                            {comp.source}
                          </Badge>
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
                        <div key={i} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <span className="text-muted-foreground">{d.dimension}</span>
                          <span className={`font-semibold ${d.score >= 80 ? 'text-green-500' : d.score < 50 ? 'text-red-500' : 'text-foreground'}`}>
                            {d.score}/100
                          </span>
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
                        <span className="text-foreground/90">{item}</span>
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
                        <span className="text-foreground/90">{item}</span>
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
                  {aiAnalysis.suggestions?.map((item: string, i: number) => (
                    <div key={i} className="flex gap-4 p-4 rounded-lg bg-card/50 border border-white/5">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm text-foreground leading-relaxed">{item}</p>
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
                      <p key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-red-500/50">•</span> {item}
                      </p>
                    ))}
                  </div>
                </GlassCard>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </PageBackground>
  );
};

export default Report;