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
import {
  getTrendingTopics,
  getCategories,
  getDiscoverStats,
  getUserTopicInterests,
  TrendingTopic,
} from "@/services/discoverService";
import { useAuth } from "@/hooks/useAuth";
import { Compass, Radar, Sparkles } from "lucide-react";

export default function Discover() {
  const { user } = useAuth();

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minHeatScore, setMinHeatScore] = useState(0);
  const [sortBy, setSortBy] = useState<'heat_score' | 'growth_rate' | 'discovered_at'>('heat_score');

  // User interests map
  const [userInterests, setUserInterests] = useState<Map<string, 'saved' | 'validated' | 'dismissed'>>(new Map());

  // Fetch trending topics
  const { data: topics, isLoading: topicsLoading, refetch: refetchTopics } = useQuery({
    queryKey: ['trending-topics', selectedCategory, minHeatScore, sortBy],
    queryFn: () => getTrendingTopics({
      category: selectedCategory || undefined,
      minHeatScore,
      sortBy,
    }),
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['discover-categories'],
    queryFn: getCategories,
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['discover-stats'],
    queryFn: getDiscoverStats,
  });

  // Fetch user interests when logged in
  useEffect(() => {
    if (user) {
      getUserTopicInterests().then(setUserInterests);
    }
  }, [user]);

  const handleInterestChange = (topicId: string, interest: 'saved' | 'validated' | 'dismissed' | null) => {
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

  const handleResetFilters = () => {
    setSelectedCategory(null);
    setMinHeatScore(0);
    setSortBy('heat_score');
  };

  return (
    <PageBackground>
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
            <Radar className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">热点雷达</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            发现市场
            <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
              热门机会
            </span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            基于小红书、抖音等平台的实时数据，发现正在崛起的市场需求和用户痛点
          </p>
        </div>

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

        {/* Filters */}
        <div className="mb-6">
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

        {/* Topics Grid */}
        {topicsLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : topics && topics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {topics.map(topic => (
              <TrendingTopicCard
                key={topic.id}
                topic={topic}
                userInterest={userInterests.get(topic.id)}
                onInterestChange={handleInterestChange}
              />
            ))}
          </div>
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
      </main>
    </PageBackground>
  );
}
