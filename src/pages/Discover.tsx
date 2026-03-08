import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/shared/Navbar";
import { PageBackground } from "@/components/shared/PageBackground";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { TrendingTopicCard } from "@/components/discover/TrendingTopicCard";
import { DiscoverFilters } from "@/components/discover/DiscoverFilters";
import { DiscoverStats } from "@/components/discover/DiscoverStats";
import { PersonalizedSection } from "@/components/discover/PersonalizedSection";
import { OpportunityBubbleChart } from "@/components/discover/OpportunityBubbleChart";
import { Button } from "@/components/ui/button";
import {
  getTrendingTopics,
  getPublicTrendingTopics,
  getCategories,
  getDiscoverStats,
  getUserTopicInterests,
  TrendingTopic,
} from "@/services/discoverService";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Compass, Radar, Sparkles, LayoutGrid, ScatterChart, TrendingUp, LogIn } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { captureEvent } from "@/lib/posthog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HunterSection } from "@/components/discover/HunterSection";

export default function Discover() {
  const { user, session, isLoading: authLoading } = useAuth();
  const { isAdmin } = useAdminAuth();
  const isAuthenticated = !!session?.user;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "market";
  useDocumentTitle("热点雷达 - 发现商业机会");

  const handleTabChange = (value: string) => {
    captureEvent('discover_tab_changed', { tab: value });
    setSearchParams(prev => {
      prev.set("tab", value);
      return prev;
    });
  };

  // View mode state
  const [viewMode, setViewMode] = useState<"cards" | "bubble">("cards");

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minHeatScore, setMinHeatScore] = useState(0);
  const [sortBy, setSortBy] = useState<'heat_score' | 'growth_rate' | 'discovered_at' | 'quality_score' | 'validation_count'>('quality_score');

  // User interests map
  const [userInterests, setUserInterests] = useState<Map<string, 'saved' | 'validated' | 'dismissed'>>(new Map());

  // Fetch trending topics - authenticated gets full data, anonymous gets public preview
  const { data: topics, isLoading: topicsLoading, error: topicsError, refetch: refetchTopics } = useQuery({
    queryKey: ['trending-topics', session?.user?.id, selectedCategory, minHeatScore, sortBy, isAuthenticated],
    queryFn: () => isAuthenticated
      ? getTrendingTopics({ category: selectedCategory || undefined, minHeatScore, sortBy })
      : getPublicTrendingTopics(5),
    enabled: !authLoading,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['discover-categories', session?.user?.id],
    queryFn: getCategories,
    enabled: !authLoading && isAuthenticated,
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['discover-stats', session?.user?.id],
    queryFn: getDiscoverStats,
    enabled: !authLoading && isAuthenticated,
  });

  // Fetch user interests when logged in
  useEffect(() => {
    if (user) {
      getUserTopicInterests().then(setUserInterests);
    } else {
      setUserInterests(new Map());
    }
  }, [user]);

  const handleInterestChange = (topicId: string, interest: 'saved' | 'validated' | 'dismissed' | null) => {
    captureEvent('discover_interest_changed', { topic_id: topicId, interest_type: interest });
    setUserInterests(prev => {
      const next = new Map(prev);
      if (interest === null) {
        next.delete(topicId);
      } else {
        next.set(topicId, interest);
      }
      return next;
    });
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
            </TabsList>
          </div>

          {/* Tab 1: Market Monitor (Existing Discover) */}
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
                {/* Login prompt for anonymous users to see more */}
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

          {/* Tab 2: Hunter Radar (New Integration) */}
          <TabsContent value="hunter">
            <HunterSection />
          </TabsContent>
        </Tabs>
      </main>
    </PageBackground>
  );
}
