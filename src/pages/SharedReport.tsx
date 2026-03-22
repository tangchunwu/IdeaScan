import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageBackground, GlassCard, Navbar, EmptyState, ChartSkeleton } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Sparkles, Share2, BarChart3, Globe, Brain, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useReportData } from "@/components/report/useReportData";
import { ScoreHeroCard } from "@/components/report/ScoreHeroCard";
import { RadarDimensionSection } from "@/components/report/RadarDimensionSection";
import { DataOverviewTab } from "@/components/report/DataOverviewTab";
import { MarketInsightsTab } from "@/components/report/MarketInsightsTab";
import { CompetitorTab } from "@/components/report/CompetitorTab";
import { AIAnalysisTab } from "@/components/report/AIAnalysisTab";
import { QuickInsightsCards } from "@/components/report/QuickInsightsCards";
import { PersonaCard } from "@/components/dashboard/PersonaCard";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const SharedReport = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useDocumentTitle(data?.validation?.idea ? `分享报告 - ${data.validation.idea.slice(0, 30)}` : "分享报告", [data?.validation?.idea]);

  useEffect(() => {
    if (!token) return;
    (async () => {
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

  const { validation, report, marketAnalysis, xiaohongshuData, sentimentAnalysis, aiAnalysis,
    evidenceGrade, proofResult, costBreakdown, dimensions, radarData, personaData,
    competitorRows, evidenceItems, topEvidence, evidenceSummary } = reportData;

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

          {/* Quick Insights Cards */}
          <QuickInsightsCards
            score={displayScore}
            competitionLevel={marketAnalysis.competitionLevel}
            strengths={aiAnalysis.strengths}
            weaknesses={aiAnalysis.weaknesses}
            sentimentPositive={sentimentAnalysis.positive}
          />

          {/* Score Hero */}
          <div className="mb-3 sm:mb-4 animate-slide-up">
            <ScoreHeroCard
              score={displayScore}
              totalNotes={xiaohongshuData.totalNotes}
              isIncomplete={false}
              idea={validation.idea}
              overallVerdict={aiAnalysis.overallVerdict}
              strengths={aiAnalysis.strengths || []}
              weaknesses={aiAnalysis.weaknesses || []}
            />
          </div>

          {/* Persona Card */}
          {personaData && (
            <div className="mb-3 sm:mb-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <PersonaCard persona={personaData} validationId={validation.id} />
            </div>
          )}

          {/* Radar */}
          <RadarDimensionSection radarData={radarData} dimensions={dimensions} />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
            <div className="relative">
              <TabsList className="glass-card p-1 w-full justify-start overflow-x-auto scrollbar-hide flex-nowrap">
                <TabsTrigger value="overview" className="rounded-lg text-xs sm:text-sm gap-1 sm:gap-2"><BarChart3 className="w-4 h-4" /><span>概览</span></TabsTrigger>
                <TabsTrigger value="market" className="rounded-lg text-xs sm:text-sm gap-1 sm:gap-2"><Sparkles className="w-4 h-4" /><span>市场</span></TabsTrigger>
                <TabsTrigger value="competitors" className="rounded-lg text-xs sm:text-sm gap-1 sm:gap-2"><Globe className="w-4 h-4" /><span>竞品</span></TabsTrigger>
                <TabsTrigger value="ai" className="rounded-lg text-xs sm:text-sm gap-1 sm:gap-2"><Brain className="w-4 h-4" /><span>AI</span></TabsTrigger>
              </TabsList>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <TabsContent value="overview" forceMount={activeTab === "overview" ? true : undefined}>
                  {activeTab === "overview" && (
                    <DataOverviewTab
                      data={reportData}
                      dataSummary={report?.data_summary as any}
                      dataQualityScore={report?.data_quality_score ?? undefined}
                      keywordsUsed={report?.keywords_used as any}
                      demandDecisionProps={{
                        validation,
                        score: displayScore,
                        xiaohongshuData,
                        sentimentAnalysis,
                        marketAnalysis,
                        aiAnalysis,
                        proofResult,
                        costBreakdown,
                        topEvidence,
                        evidenceSummary,
                        evidenceItems,
                        platforms: [
                          { name: "小红书", count: xiaohongshuData.totalNotes || 0 },
                          ...((report?.data_summary as any)?.douyin?.totalVideos ? [{ name: "抖音", count: (report.data_summary as any).douyin.totalVideos }] : []),
                        ],
                      }}
                    />
                  )}
                </TabsContent>
                <TabsContent value="market" forceMount={activeTab === "market" ? true : undefined}>
                  {activeTab === "market" && <MarketInsightsTab data={reportData} />}
                </TabsContent>
                <TabsContent value="competitors" forceMount={activeTab === "competitors" ? true : undefined}>
                  {activeTab === "competitors" && <CompetitorTab data={reportData} />}
                </TabsContent>
                <TabsContent value="ai" forceMount={activeTab === "ai" ? true : undefined}>
                  {activeTab === "ai" && <AIAnalysisTab data={reportData} aiAnalysis={aiAnalysis} />}
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </Tabs>

          {/* Light footer hint */}
          <div className="mt-10 text-center text-sm text-muted-foreground">
            <span>由 </span>
            <a href="/" className="text-primary hover:underline font-medium">IdeaScan</a>
            <span> 生成 · </span>
            <a href="/auth" className="text-primary hover:underline">免费验证你的创业想法 →</a>
          </div>
        </div>
      </main>
    </PageBackground>
  );
};

export default SharedReport;
