import { supabase } from "@/integrations/supabase/client";

export interface TrendingTopic {
  id: string;
  keyword: string;
  category: string | null;
  heat_score: number;
  growth_rate: number | null;
  sample_count: number;
  avg_engagement: number;
  sentiment_positive: number;
  sentiment_negative: number;
  sentiment_neutral: number;
  top_pain_points: string[];
  related_keywords: string[];
  sources: { platform: string; count: number }[];
  discovered_at: string;
  updated_at: string;
  is_active: boolean;
  created_by: string | null;
  // User interaction state
  user_interest?: 'saved' | 'validated' | 'dismissed' | null;
}

export interface DiscoverFilters {
  category?: string;
  minHeatScore?: number;
  sortBy?: 'heat_score' | 'growth_rate' | 'discovered_at';
  limit?: number;
}

// Fetch trending topics with optional filters
export async function getTrendingTopics(filters: DiscoverFilters = {}): Promise<TrendingTopic[]> {
  const { category, minHeatScore = 0, sortBy = 'heat_score', limit = 50 } = filters;

  let query = supabase
    .from('trending_topics')
    .select('*')
    .eq('is_active', true)
    .gte('heat_score', minHeatScore)
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching trending topics:', error);
    throw new Error('获取热点话题失败');
  }

  // Type assertion for the JSONB fields
  return (data || []).map(topic => ({
    ...topic,
    top_pain_points: topic.top_pain_points || [],
    related_keywords: topic.related_keywords || [],
    sources: (topic.sources as { platform: string; count: number }[]) || [],
  }));
}

// Get user's saved/validated topics
export async function getUserTopicInterests(): Promise<Map<string, 'saved' | 'validated' | 'dismissed'>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Map();

  const { data, error } = await supabase
    .from('user_topic_interests')
    .select('topic_id, interest_type')
    .eq('user_id', session.user.id);

  if (error) {
    console.error('Error fetching user interests:', error);
    return new Map();
  }

  const interestMap = new Map<string, 'saved' | 'validated' | 'dismissed'>();
  data?.forEach(item => {
    interestMap.set(item.topic_id, item.interest_type as 'saved' | 'validated' | 'dismissed');
  });

  return interestMap;
}

// Save/bookmark a topic
export async function saveTopicInterest(
  topicId: string,
  interestType: 'saved' | 'validated' | 'dismissed'
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('请先登录');

  const { error } = await supabase
    .from('user_topic_interests')
    .upsert({
      user_id: session.user.id,
      topic_id: topicId,
      interest_type: interestType,
    }, {
      onConflict: 'user_id,topic_id',
    });

  if (error) {
    console.error('Error saving topic interest:', error);
    throw new Error('保存失败');
  }
}

// Remove topic interest
export async function removeTopicInterest(topicId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('请先登录');

  const { error } = await supabase
    .from('user_topic_interests')
    .delete()
    .eq('user_id', session.user.id)
    .eq('topic_id', topicId);

  if (error) {
    console.error('Error removing topic interest:', error);
    throw new Error('取消失败');
  }
}

// Get available categories
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('trending_topics')
    .select('category')
    .eq('is_active', true)
    .not('category', 'is', null);

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  const categories = [...new Set(data?.map(d => d.category).filter(Boolean) as string[])];
  return categories.sort();
}

// Get topic statistics for dashboard
export async function getDiscoverStats(): Promise<{
  totalTopics: number;
  avgHeatScore: number;
  topCategories: { category: string; count: number }[];
}> {
  const { data, error } = await supabase
    .from('trending_topics')
    .select('heat_score, category')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching discover stats:', error);
    return { totalTopics: 0, avgHeatScore: 0, topCategories: [] };
  }

  const totalTopics = data?.length || 0;
  const avgHeatScore = totalTopics > 0
    ? Math.round(data.reduce((sum, t) => sum + (t.heat_score || 0), 0) / totalTopics)
    : 0;

  // Count by category
  const categoryCount = new Map<string, number>();
  data?.forEach(t => {
    if (t.category) {
      categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
    }
  });

  const topCategories = Array.from(categoryCount.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { totalTopics, avgHeatScore, topCategories };
}

// 新增：记录用户点击行为
export async function trackTopicClick(
  topicId: string | null,
  keyword: string,
  clickType: 'view' | 'expand' | 'validate'
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // 未登录用户不记录

  try {
    await supabase
      .from('user_topic_clicks')
      .insert({
        user_id: session.user.id,
        topic_id: topicId,
        keyword: keyword,
        click_type: clickType,
      });
  } catch (error) {
    // 静默失败，不影响用户体验
    console.warn('Failed to track topic click:', error);
  }
}

