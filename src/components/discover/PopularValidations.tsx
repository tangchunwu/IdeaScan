import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Flame, Clock, ArrowRight, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface PopularIdea {
       id: string;
       idea: string;
       category: string | null;
       overall_score: number;
       validation_count: number;
       created_at: string;
}

interface PopularValidationsProps {
       limit?: number;
       showTitle?: boolean;
       className?: string;
}

const fetchPopularValidations = async (limit: number): Promise<PopularIdea[]> => {
       // Get validations from the last 7 days, grouped by similar ideas
       const sevenDaysAgo = new Date();
       sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

       const { data, error } = await supabase
              .from("validations")
              .select("id, idea, category, overall_score, created_at")
              .gte("created_at", sevenDaysAgo.toISOString())
              .not("overall_score", "is", null)
              .order("created_at", { ascending: false })
              .limit(100);

       if (error) {
              console.error("Error fetching popular validations:", error);
              return [];
       }

       // Group by similar ideas (simplified - just count by first 20 chars)
       const ideaGroups = new Map<string, PopularIdea & { count: number }>();

       (data || []).forEach((item: any) => {
              const key = item.idea.substring(0, 30).toLowerCase().trim();
              const existing = ideaGroups.get(key);

              if (existing) {
                     existing.count += 1;
                     // Keep the highest score version
                     if (item.overall_score > existing.overall_score) {
                            existing.id = item.id;
                            existing.overall_score = item.overall_score;
                     }
              } else {
                     ideaGroups.set(key, {
                            ...item,
                            validation_count: 1,
                            count: 1,
                     });
              }
       });

       // Sort by count and return top N
       return Array.from(ideaGroups.values())
              .sort((a, b) => b.count - a.count)
              .slice(0, limit)
              .map(item => ({
                     id: item.id,
                     idea: item.idea,
                     category: item.category,
                     overall_score: item.overall_score,
                     validation_count: item.count,
                     created_at: item.created_at,
              }));
};

export const PopularValidations = ({
       limit = 5,
       showTitle = true,
       className = "",
}: PopularValidationsProps) => {
       const navigate = useNavigate();

       const { data: popularIdeas, isLoading } = useQuery({
              queryKey: ["popular-validations", limit],
              queryFn: () => fetchPopularValidations(limit),
              staleTime: 5 * 60 * 1000, // 5 minutes
       });

       const handleClick = (idea: PopularIdea) => {
              // Navigate to validate page with pre-filled idea
              navigate(`/validate?idea=${encodeURIComponent(idea.idea)}`);
       };

       const handleViewReport = (id: string, e: React.MouseEvent) => {
              e.stopPropagation();
              navigate(`/report/${id}`);
       };

       const getScoreColor = (score: number) => {
              if (score >= 75) return "text-green-500";
              if (score >= 50) return "text-yellow-500";
              return "text-red-500";
       };

       const getTimeAgo = (dateStr: string) => {
              const now = new Date();
              const date = new Date(dateStr);
              const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

              if (diffHours < 1) return "刚刚";
              if (diffHours < 24) return `${diffHours}小时前`;
              const diffDays = Math.floor(diffHours / 24);
              return `${diffDays}天前`;
       };

       if (isLoading) {
              return (
                     <GlassCard className={`p-6 ${className}`}>
                            {showTitle && (
                                   <div className="flex items-center gap-2 mb-4">
                                          <Skeleton className="w-5 h-5 rounded" />
                                          <Skeleton className="w-32 h-6" />
                                   </div>
                            )}
                            <div className="space-y-3">
                                   {[...Array(limit)].map((_, i) => (
                                          <Skeleton key={i} className="h-16 w-full rounded-xl" />
                                   ))}
                            </div>
                     </GlassCard>
              );
       }

       if (!popularIdeas || popularIdeas.length === 0) {
              return (
                     <GlassCard className={`p-6 ${className}`}>
                            {showTitle && (
                                   <div className="flex items-center gap-2 mb-4">
                                          <Flame className="w-5 h-5 text-orange-500" />
                                          <h3 className="font-semibold">本周热门验证</h3>
                                   </div>
                            )}
                            <div className="text-center py-8 text-muted-foreground">
                                   <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                   <p className="text-sm">暂无热门验证，成为第一个！</p>
                            </div>
                     </GlassCard>
              );
       }

       return (
              <GlassCard className={`p-6 ${className}`}>
                     {showTitle && (
                            <div className="flex items-center justify-between mb-4">
                                   <div className="flex items-center gap-2">
                                          <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
                                          <h3 className="font-semibold">本周热门验证</h3>
                                          <Badge variant="secondary" className="text-xs">
                                                 Top {limit}
                                          </Badge>
                                   </div>
                            </div>
                     )}

                     <div className="space-y-3">
                            {popularIdeas.map((idea, index) => (
                                   <div
                                          key={idea.id}
                                          onClick={() => handleClick(idea)}
                                          className="flex items-center gap-4 p-4 rounded-xl bg-card/50 hover:bg-card/80 border border-transparent hover:border-primary/20 transition-all cursor-pointer group"
                                   >
                                          {/* Rank Badge */}
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                                                        index === 1 ? "bg-gray-400/20 text-gray-400" :
                                                               index === 2 ? "bg-orange-600/20 text-orange-600" :
                                                                      "bg-muted text-muted-foreground"
                                                 }`}>
                                                 {index + 1}
                                          </div>

                                          {/* Content */}
                                          <div className="flex-1 min-w-0">
                                                 <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                                                        {idea.idea}
                                                 </p>
                                                 <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                               <Users className="w-3 h-3" />
                                                               {idea.validation_count} 人验证
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                               <Clock className="w-3 h-3" />
                                                               {getTimeAgo(idea.created_at)}
                                                        </span>
                                                 </div>
                                          </div>

                                          {/* Score */}
                                          <div className="text-right">
                                                 <div className={`text-lg font-bold ${getScoreColor(idea.overall_score)}`}>
                                                        {idea.overall_score}
                                                 </div>
                                                 <div className="text-[10px] text-muted-foreground">评分</div>
                                          </div>

                                          {/* View Report Button */}
                                          <Button
                                                 variant="ghost"
                                                 size="sm"
                                                 onClick={(e) => handleViewReport(idea.id, e)}
                                                 className="opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                                 <ArrowRight className="w-4 h-4" />
                                          </Button>
                                   </div>
                            ))}
                     </div>

                     {/* CTA */}
                     <Button
                            variant="outline"
                            className="w-full mt-4"
                            onClick={() => navigate("/validate")}
                     >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            验证你的想法
                     </Button>
              </GlassCard>
       );
};

export default PopularValidations;
