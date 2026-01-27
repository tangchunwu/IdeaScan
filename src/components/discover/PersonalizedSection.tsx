import { useQuery } from '@tanstack/react-query';
import { TrendingTopic, getPersonalizedRecommendations } from '@/services/discoverService';
import { TrendingTopicCard } from './TrendingTopicCard';
import { Sparkles, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared';
import { useAuth } from '@/hooks/useAuth';

interface PersonalizedSectionProps {
        onValidate?: (topic: TrendingTopic) => void;
}

export function PersonalizedSection({ onValidate }: PersonalizedSectionProps) {
        const { user } = useAuth();

        const { data: recommendations, isLoading, error } = useQuery({
                queryKey: ['personalizedRecommendations', user?.id],
                queryFn: () => getPersonalizedRecommendations(6),
                enabled: !!user,
                staleTime: 5 * 60 * 1000, // 5 minutes
        });

        // Don't show section if not logged in or no recommendations
        if (!user) return null;
        if (isLoading) {
                return (
                        <div className="mb-8">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                        为你推荐
                                </h2>
                                <div className="flex justify-center py-8">
                                        <LoadingSpinner size="md" />
                                </div>
                        </div>
                );
        }

        if (error || !recommendations?.length) {
                return null; // Silently hide if no recommendations
        }

        return (
                <section className="mb-8 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                        为你推荐
                                </h2>
                                <span className="text-sm text-muted-foreground flex items-center gap-1">
                                        基于你的验证历史
                                        <ChevronRight className="w-4 h-4" />
                                </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {recommendations.map((topic) => (
                                        <TrendingTopicCard
                                                key={topic.id}
                                                topic={topic}
                                                onValidate={() => onValidate?.(topic)}
                                                isPersonalized
                                        />
                                ))}
                        </div>
                </section>
        );
}
