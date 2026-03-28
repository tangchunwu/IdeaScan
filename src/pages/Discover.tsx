import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/shared/Navbar";
import { PageBackground } from "@/components/shared/PageBackground";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { GlassCard } from "@/components/shared/GlassCard";
import { TrendingTopicCard } from "@/components/discover/TrendingTopicCard";
import { DiscoverFilters } from "@/components/discover/DiscoverFilters";
import { DiscoverStats } from "@/components/discover/DiscoverStats";
import { PersonalizedSection } from "@/components/discover/PersonalizedSection";
import { OpportunityBubbleChart } from "@/components/discover/OpportunityBubbleChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTrendingTopics,
  getPublicTrendingTopics,
  getDiscoverStatsAndCategories,
  getUserTopicInterests,
} from "@/services/discoverService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Compass, Radar, Sparkles, LayoutGrid, ScatterChart, TrendingUp, LogIn, Award, Eye, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { captureEvent } from "@/lib/posthog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HunterSection } from "@/components/discover/HunterSection";
import { ScrollReveal } from "@/components/shared/ScrollReveal";

interface GalleryReport {
  id: string;
  idea: string;
  tags: string[];
  overall_score: number;
  share_token: string;
  created_at: string;
}

const fetchGalleryReports = async (): Promise<GalleryReport[]> => {
  const { data, error } = await supabase
    .from("validations")
    .select("id, idea, tags, overall_score, share_token, created_at")
    .not("share_token", "is", null)
    .not("overall_score", "is", null)
    .gte("overall_score", 60)
    .eq("status", "completed")
    .order("overall_score", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as GalleryReport[]) || [];
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-secondary";
  if (score >= 60) return "text-primary";
  return "text-muted-foreground";
};

const getScoreLabel = (score: number) => {
  if (score >= 85) return "极具潜力";
  if (score >= 75) return "值得关注";
  if (score >= 65) return "有一定潜力";
  return "待深入分析";
};

export default function Discover() {
  const { user, session, isLoading: authLoading } = useAuth();
  const { isAdmin } = useAdminAuth();
  const isAuthenticated = !!session?.user;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "market";
  useDocumentTitle("热点雷达 - 发现商业机会", { description: "发现正在爆发的市场机会，追踪社媒热门话题和创业趋势。" });

  const handleTabChange = (value: string) => {
    captureEvent('discover_tab_changed', { tab: value });
    setSearchParams(prev => {
      prev.set("tab", value);
      return prev;
    });
  };

  // Gallery reports query
  const { data: galleryReports = [], isLoading: galleryLoading } = useQuery({
    queryKey: ['gallery-reports'],
    queryFn: fetchGalleryReports,
    staleTime: 5 * 60 * 1000,
  });

  // View mode state
  const [viewMode, setViewMode] = useState<"cards" | "bubble">("cards");

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minHeatScore, setMinHeatScore] = useState(0);
  const [sortBy, setSortBy] = useState<'heat_score' | 'growth_rate' | 'discovered_at' | 'quality_score' | 'validation_count'>('quality_score');

  // User interests via React Query
  const { data: userInterests = new Map<string, 'saved' | 'validated' | 'dismissed'>() } = useQuery({
    queryKey: ['user-topic-interests', user?.id],
    queryFn: getUserTopicInterests,
    enabled: !!user,
  });

  // Combined stats + categories in a single query
  const { data: statsAndCategories, isLoading: statsLoading } = useQuery({
    queryKey: ['discover-stats-categories', session?.user?.id],
    queryFn: getDiscoverStatsAndCategories,
    enabled: !authLoading && isAuthenticated,
  });

  const categories = statsAndCategories?.categories || [];
  const stats = statsAndCategories;

  // Fetch trending topics
  const { data: topics, isLoading: topicsLoading, error: topicsError, refetch: refetchTopics } = useQuery({
    queryKey: ['trending-topics', session?.user?.id, selectedCategory, minHeatScore, sortBy, isAuthenticated],
    queryFn: () => isAuthenticated
      ? getTrendingTopics({ category: selectedCategory || undefined, minHeatScore, sortBy })
      : getPublicTrendingTopics(5),
    enabled: !authLoading,
  });

  const handleInterestChange = (topicId: string, interest: 'saved' | 'validated' | 'dismissed' | null) => {
    captureEvent('discover_interest_changed', { topic_id: topicId, interest_type: interest });
  };

  const handleDeleteTopic = () => {
    refetchTopics();
  };

  const handleResetFilters = () => {
    setSelectedCategory(null);
    setMinHeatScore(0);
    setSortBy('quality_score');
  };

  // Transform topics for bubble chart
  const bubbleData = (topics || []).map(topic => ({
    id: topic.id,
    name: topic.keyword,
    heatScore: topic.heat_score || 0,
    growthRate: topic.growth_rate || 0,
    sampleSize: topic.sample_count || 100,
    category: topic.category,
  }));

  const handleBubbleClick = (item: any) => {
    captureEvent('discover_topic_clicked', { topic: item.name, source: 'bubble_chart' });
    navigate(`/validate?topic=${encodeURIComponent(item.name)}`);
  };

  return (
    <PageBackground>
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
            <Compass className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">全网机会雷达</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            发现即将爆发的
            <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
              商业机会
            </span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            捕捉全网数据信号，从热门话题到长尾痛点，先人一步发现需求
          </p>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-white/5 border border-white/10 p-1">
              <TabsTrigger value="market" className="px-6 gap-2">
                <TrendingUp className="w-4 h-4" />
                热点雷达
              </TabsTrigger>
              <TabsTrigger value="hunter" className="px-6 gap-2">
                <Radar className="w-4 h-4" />
                狩猎雷达
              </TabsTrigger>
              <TabsTrigger value="gallery" className="px-6 gap-2">
                <Award className="w-4 h-4" />
                精选报告
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab 1: Market Monitor */}
          <TabsContent value="market" className="space-y-8 animate-fade-in">
            {/* Stats */}
            <div className="mb-8">
              <DiscoverStats
                totalTopics={stats?.totalTopics || 0}
                avgHeatScore={stats?.avgHeatScore || 0}
                topCategories={stats?.topCategories || []}
                isLoading={statsLoading}
              />
            </div>

            {/* Personalized Recommendations */}
            <PersonalizedSection />

            {/* Filters + View Toggle */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <DiscoverFilters
                  categories={categories}
                  selectedCategory={selectedCategory}
                  minHeatScore={minHeatScore}
                  sortBy={sortBy}
                  onCategoryChange={setSelectedCategory}
                  onHeatScoreChange={setMinHeatScore}
                  onSortChange={setSortBy}
                  onReset={handleResetFilters}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "cards" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className="gap-2"
                >
                  <LayoutGrid className="w-4 h-4" />
                  卡片
                </Button>
                <Button
                  variant={viewMode === "bubble" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("bubble")}
                  className="gap-2"
                >
                  <ScatterChart className="w-4 h-4" />
                  气泡图
                </Button>
              </div>
            </div>

            {/* Topics Display */}
            {(authLoading || topicsLoading) ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner size="lg" />
              </div>
            ) : topicsError ? (
              <EmptyState
                icon={Compass}
                title="热点加载失败"
                description="登录态可能已过期，请刷新页面或重新登录后重试"
                actionLabel="重新加载"
                onAction={() => refetchTopics()}
              />
            ) : topics && topics.length > 0 ? (
              <>
                {viewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {topics.map(topic => (
                      <TrendingTopicCard
                        key={topic.id}
                        topic={topic}
                        userInterest={userInterests.get(topic.id)}
                        onInterestChange={handleInterestChange}
                        isAdmin={isAdmin}
                        onDelete={handleDeleteTopic}
                      />
                    ))}
                  </div>
                ) : (
                  <OpportunityBubbleChart
                    data={bubbleData}
                    onBubbleClick={handleBubbleClick}
                  />
                )}
                {/* Login prompt for anonymous users */}
                {!isAuthenticated && (
                  <div className="mt-8 text-center">
                    <div className="inline-flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/30 border border-border/30">
                      <LogIn className="w-6 h-6 text-primary" />
                      <p className="text-sm text-muted-foreground">登录后查看全部热点话题、筛选排序和个性化推荐</p>
                      <Button size="sm" onClick={() => navigate("/auth")}>
                        登录解锁完整数据
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={Compass}
                title="暂无热点话题"
                description="系统正在收集和分析市场数据，请稍后再来查看"
              />
            )}

            {/* Coming Soon Note */}
            <div className="mt-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-muted-foreground text-sm">
                <Sparkles className="w-4 h-4" />
                更多热点话题持续更新中...
              </div>
            </div>
          </TabsContent>

          {/* Tab 2: Hunter Radar */}
          <TabsContent value="hunter">
            <HunterSection />
          </TabsContent>
          {/* Tab 3: Gallery */}
          <TabsContent value="gallery" className="space-y-8 animate-fade-in">
            {/* Stats */}
            {!galleryLoading && galleryReports.length > 0 && (
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                <GlassCard className="text-center py-3">
                  <p className="text-2xl font-bold text-primary">{galleryReports.length}</p>
                  <p className="text-xs text-muted-foreground">精选报告</p>
                </GlassCard>
                <GlassCard className="text-center py-3">
                  <p className="text-2xl font-bold text-secondary">
                    {Math.round(galleryReports.reduce((a, b) => a + b.overall_score, 0) / galleryReports.length)}
                  </p>
                  <p className="text-xs text-muted-foreground">平均分</p>
                </GlassCard>
                <GlassCard className="text-center py-3">
                  <p className="text-2xl font-bold text-foreground">{galleryReports[0]?.overall_score || 0}</p>
                  <p className="text-xs text-muted-foreground">最高分</p>
                </GlassCard>
              </div>
            )}

            {/* Loading */}
            {galleryLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <GlassCard key={i} className="h-full animate-pulse">
                    <div className="flex items-start justify-between mb-3">
                      <Skeleton className="h-5 w-16 rounded" />
                      <Skeleton className="h-8 w-12 rounded" />
                    </div>
                    <Skeleton className="h-5 w-full mb-1 rounded" />
                    <Skeleton className="h-5 w-3/4 mb-4 rounded" />
                    <div className="flex gap-1.5 mb-4">
                      <Skeleton className="h-4 w-12 rounded" />
                      <Skeleton className="h-4 w-14 rounded" />
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}

            {/* Empty */}
            {!galleryLoading && galleryReports.length === 0 && (
              <EmptyState
                icon={Search}
                title="暂无公开报告"
                description="还没有用户分享他们的验证报告。成为第一个分享者！"
                actionLabel="开始验证"
                actionLink="/validate"
              />
            )}

            {/* Report Grid */}
            {!galleryLoading && galleryReports.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {galleryReports.map((report, index) => (
                  <Link
                    key={report.id}
                    to={`/share/${report.share_token}`}
                    className="group"
                  >
                    <GlassCard
                      hover
                      className="h-full animate-slide-up transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/10"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <Badge variant="outline" className={`text-xs ${getScoreColor(report.overall_score)}`}>
                          {getScoreLabel(report.overall_score)}
                        </Badge>
                        <div className="text-right">
                          <span className={`text-2xl font-bold ${getScoreColor(report.overall_score)}`}>
                            {report.overall_score}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {report.idea}
                      </h3>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {(report.tags || []).slice(0, 3).map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0 bg-muted/40">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-border/30">
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString("zh-CN")}
                        </span>
                        <span className="text-xs text-primary flex items-center gap-1 group-hover:underline">
                          <Eye className="w-3 h-3" />
                          查看报告
                        </span>
                      </div>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="text-center mt-4">
              <GlassCard className="inline-block px-8 py-6">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="text-lg font-bold mb-2">想让你的报告也出现在这里？</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  完成验证后，点击"分享"按钮即可将报告公开展示
                </p>
                <Button asChild className="rounded-full">
                  <Link to="/validate">免费开始验证</Link>
                </Button>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </PageBackground>
  );
}
