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
  return (data || []).map((topic: any) => ({
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
  (data || []).forEach((item: any) => {
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
    } as any, {
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

  const categories = [...new Set((data || []).map((d: any) => d.category).filter(Boolean) as string[])];
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

  const topics = (data || []) as { heat_score: number; category: string | null }[];
  const totalTopics = topics.length;
  const avgHeatScore = totalTopics > 0
    ? Math.round(topics.reduce((sum, t) => sum + (t.heat_score || 0), 0) / totalTopics)
    : 0;

  // Count by category
  const categoryCount = new Map<string, number>();
  topics.forEach(t => {
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
      } as any);
  } catch (error) {
    // 静默失败，不影响用户体验
    console.warn('Failed to track topic click:', error);
  }
}

// 新增：获取个性化推荐 (基于用户历史验证的tags)
export async function getPersonalizedRecommendations(limit = 6): Promise<TrendingTopic[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  try {
    // 1. 获取用户历史验证的 tags
    const { data: validations, error: validationError } = await supabase
      .from('validations')
      .select('tags')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (validationError || !validations?.length) {
      return [];
    }

    // 2. 提取所有 tags 并计算频率
    const tagFrequency = new Map<string, number>();
    validations.forEach((v: any) => {
      const tags = v.tags as string[] || [];
      tags.forEach(tag => {
        tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
      });
    });

    if (tagFrequency.size === 0) return [];

    // 3. 获取用户最常验证的 top 5 tags
    const topTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // 4. 查找与这些 tags 相关的热点话题
    const { data: topics, error: topicsError } = await supabase
      .from('trending_topics')
      .select('*')
      .eq('is_active', true)
      .order('heat_score', { ascending: false })
      .limit(100);

    if (topicsError || !topics?.length) return [];

    // 5. 根据 tag 匹配度排序
    const scoredTopics = (topics as any[]).map(topic => {
      let matchScore = 0;
      const keyword = topic.keyword?.toLowerCase() || '';
      const relatedKeywords = (topic.related_keywords as string[] || []).map((k: string) => k.toLowerCase());
      const category = topic.category?.toLowerCase() || '';

      topTags.forEach((tag, index) => {
        const tagLower = tag.toLowerCase();
        const weight = 5 - index; // 越靠前的 tag 权重越高

        if (keyword.includes(tagLower)) matchScore += weight * 3;
        if (category.includes(tagLower)) matchScore += weight * 2;
        if (relatedKeywords.some((k: string) => k.includes(tagLower))) matchScore += weight;
      });

      return { topic, matchScore };
    });

    // 6. 返回匹配度最高的话题
    const recommended = scoredTopics
      .filter(item => item.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit)
      .map(item => ({
        ...item.topic,
        top_pain_points: item.topic.top_pain_points || [],
        related_keywords: item.topic.related_keywords || [],
        sources: (item.topic.sources as { platform: string; count: number }[]) || [],
      }));

    return recommended;
  } catch (error) {
    console.error('Error fetching personalized recommendations:', error);
    return [];
  }
}
