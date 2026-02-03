import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, TrendingUp, TrendingDown, Minus, ArrowRight, Plus, X } from "lucide-react";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
       Dialog,
       DialogContent,
       DialogHeader,
       DialogTitle,
       DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ComparisonIdea {
       id: string;
       idea: string;
       overall_score: number;
       dimensions: { dimension: string; score: number }[];
       strengths: string[];
       weaknesses: string[];
       created_at: string;
}

interface IdeaComparisonProps {
       initialIds?: string[];
       className?: string;
}

const fetchValidationById = async (id: string): Promise<ComparisonIdea | null> => {
       const { data, error } = await supabase
              .from("validations")
              .select("id, idea, overall_score, created_at")
              .eq("id", id)
              .single();

       if (error || !data) return null;

       // Fetch report data
       const { data: report } = await supabase
              .from("validation_reports")
              .select("dimensions, ai_analysis")
              .eq("validation_id", id)
              .single();

       const aiAnalysis = (report?.ai_analysis || {}) as Record<string, any>;
       const dimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];

       return {
              id: data.id,
              idea: data.idea,
              overall_score: data.overall_score || 0,
              dimensions: dimensions.map((d: any) => ({
                     dimension: d.dimension || "未知",
                     score: d.score || 0,
              })),
              strengths: aiAnalysis.strengths || [],
              weaknesses: aiAnalysis.weaknesses || [],
              created_at: data.created_at,
       };
};

const fetchUserValidations = async (limit = 10): Promise<{ id: string; idea: string; score: number }[]> => {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) return [];

       const { data, error } = await supabase
              .from("validations")
              .select("id, idea, overall_score")
              .eq("user_id", session.user.id)
              .order("created_at", { ascending: false })
              .limit(limit);

       if (error) return [];

       return (data || []).map((v: any) => ({
              id: v.id,
              idea: v.idea,
              score: v.overall_score || 0,
       }));
};

export const IdeaComparison = ({
       initialIds = [],
       className = "",
}: IdeaComparisonProps) => {
       const navigate = useNavigate();
       const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
       const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

       // Fetch user's validations for selection
       const { data: userValidations = [] } = useQuery({
              queryKey: ["user-validations-list"],
              queryFn: () => fetchUserValidations(10),
       });

       // Fetch comparison data for selected IDs
       const { data: comparisonData = [], isLoading } = useQuery({
              queryKey: ["idea-comparison", selectedIds],
              queryFn: async () => {
                     const results = await Promise.all(selectedIds.map(fetchValidationById));
                     return results.filter((r): r is ComparisonIdea => r !== null);
              },
              enabled: selectedIds.length > 0,
       });

       const handleAddIdea = (id: string) => {
              if (selectedIds.length < 3 && !selectedIds.includes(id)) {
                     setSelectedIds([...selectedIds, id]);
              }
              setIsAddDialogOpen(false);
       };

       const handleRemoveIdea = (id: string) => {
              setSelectedIds(selectedIds.filter((i) => i !== id));
       };

       const getScoreColor = (score: number) => {
              if (score >= 75) return "text-green-500";
              if (score >= 50) return "text-yellow-500";
              return "text-red-500";
       };

       const getScoreDiff = (score1: number, score2: number) => {
              const diff = score1 - score2;
              if (diff > 0) return { icon: <TrendingUp className="w-3 h-3" />, color: "text-green-500", text: `+${diff}` };
              if (diff < 0) return { icon: <TrendingDown className="w-3 h-3" />, color: "text-red-500", text: `${diff}` };
              return { icon: <Minus className="w-3 h-3" />, color: "text-muted-foreground", text: "0" };
       };

       // Get all unique dimensions across selected ideas
       const allDimensions = [...new Set(
              comparisonData.flatMap((idea) => idea.dimensions.map((d) => d.dimension))
       )];

       const getWinner = () => {
              if (comparisonData.length < 2) return null;
              const sorted = [...comparisonData].sort((a, b) => b.overall_score - a.overall_score);
              return sorted[0];
       };

       const winner = getWinner();

       return (
              <GlassCard className={`p-6 ${className}`}>
                     {/* Header */}
                     <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                   <Scale className="w-5 h-5 text-primary" />
                                   <h3 className="font-semibold">想法对比</h3>
                                   <Badge variant="secondary" className="text-xs">
                                          {selectedIds.length}/3
                                   </Badge>
                            </div>

                            {selectedIds.length < 3 && (
                                   <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                                          <DialogTrigger asChild>
                                                 <Button variant="outline" size="sm">
                                                        <Plus className="w-4 h-4 mr-1" />
                                                        添加想法
                                                 </Button>
                                          </DialogTrigger>
                                          <DialogContent>
                                                 <DialogHeader>
                                                        <DialogTitle>选择要对比的想法</DialogTitle>
                                                 </DialogHeader>
                                                 <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                                        {userValidations
                                                               .filter((v) => !selectedIds.includes(v.id))
                                                               .map((v) => (
                                                                      <div
                                                                             key={v.id}
                                                                             onClick={() => handleAddIdea(v.id)}
                                                                             className="flex items-center justify-between p-3 rounded-lg border hover:border-primary cursor-pointer transition-colors"
                                                                      >
                                                                             <span className="text-sm truncate flex-1">{v.idea}</span>
                                                                             <Badge variant="outline" className={getScoreColor(v.score)}>
                                                                                    {v.score}分
                                                                             </Badge>
                                                                      </div>
                                                               ))}
                                                        {userValidations.filter((v) => !selectedIds.includes(v.id)).length === 0 && (
                                                               <p className="text-sm text-muted-foreground text-center py-4">
                                                                      没有更多可对比的想法
                                                               </p>
                                                        )}
                                                 </div>
                                          </DialogContent>
                                   </Dialog>
                            )}
                     </div>

                     {/* Empty State */}
                     {selectedIds.length === 0 && (
                            <div className="text-center py-12">
                                   <Scale className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                   <p className="text-muted-foreground mb-4">选择 2-3 个验证过的想法进行对比</p>
                                   <Button variant="outline" onClick={() => setIsAddDialogOpen(true)}>
                                          开始对比
                                   </Button>
                            </div>
                     )}

                     {/* Loading */}
                     {isLoading && selectedIds.length > 0 && (
                            <div className="space-y-4">
                                   {[...Array(selectedIds.length)].map((_, i) => (
                                          <Skeleton key={i} className="h-24 w-full" />
                                   ))}
                            </div>
                     )}

                     {/* Comparison Table */}
                     {!isLoading && comparisonData.length > 0 && (
                            <div className="space-y-6">
                                   {/* Winner Banner */}
                                   {winner && comparisonData.length >= 2 && (
                                          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                                                 <div className="flex items-center gap-2 text-green-500">
                                                        <TrendingUp className="w-5 h-5" />
                                                        <span className="font-medium">推荐选择：</span>
                                                        <span className="font-bold">{winner.idea.slice(0, 30)}...</span>
                                                        <Badge className="ml-auto bg-green-500">
                                                               {winner.overall_score}分
                                                        </Badge>
                                                 </div>
                                          </div>
                                   )}

                                   {/* Ideas Grid */}
                                   <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${comparisonData.length}, 1fr)` }}>
                                          {comparisonData.map((idea) => (
                                                 <div key={idea.id} className="relative">
                                                        {/* Remove Button */}
                                                        <button
                                                               onClick={() => handleRemoveIdea(idea.id)}
                                                               className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 z-10"
                                                        >
                                                               <X className="w-3 h-3" />
                                                        </button>

                                                        <div className={`p-4 rounded-xl border-2 ${winner?.id === idea.id ? "border-green-500 bg-green-500/5" : "border-border bg-card/50"
                                                               }`}>
                                                               <h4 className="font-medium text-sm mb-2 line-clamp-2">{idea.idea}</h4>
                                                               <div className={`text-2xl font-bold ${getScoreColor(idea.overall_score)}`}>
                                                                      {idea.overall_score}分
                                                               </div>
                                                        </div>
                                                 </div>
                                          ))}
                                   </div>

                                   {/* Dimension Comparison */}
                                   {allDimensions.length > 0 && (
                                          <div className="space-y-3">
                                                 <h4 className="text-sm font-medium text-muted-foreground">维度对比</h4>
                                                 {allDimensions.slice(0, 6).map((dim) => (
                                                        <div key={dim} className="flex items-center gap-2">
                                                               <span className="text-xs w-20 truncate text-muted-foreground">{dim}</span>
                                                               <div className="flex-1 flex gap-2">
                                                                      {comparisonData.map((idea) => {
                                                                             const dimData = idea.dimensions.find((d) => d.dimension === dim);
                                                                             const score = dimData?.score || 0;
                                                                             return (
                                                                                    <div key={idea.id} className="flex-1">
                                                                                           <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                                                  <div
                                                                                                         className={`h-full rounded-full transition-all ${score >= 70 ? "bg-green-500" :
                                                                                                                       score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                                                                                }`}
                                                                                                         style={{ width: `${score}%` }}
                                                                                                  />
                                                                                           </div>
                                                                                           <span className="text-[10px] text-muted-foreground">{score}</span>
                                                                                    </div>
                                                                             );
                                                                      })}
                                                               </div>
                                                        </div>
                                                 ))}
                                          </div>
                                   )}

                                   {/* View Reports */}
                                   <div className="flex gap-2 pt-4 border-t border-border/50">
                                          {comparisonData.map((idea) => (
                                                 <Button
                                                        key={idea.id}
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => navigate(`/report/${idea.id}`)}
                                                 >
                                                        查看详情
                                                        <ArrowRight className="w-3 h-3 ml-1" />
                                                 </Button>
                                          ))}
                                   </div>
                            </div>
                     )}
              </GlassCard>
       );
};

export default IdeaComparison;
