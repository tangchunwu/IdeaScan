import { useState, useEffect } from "react";
import { PageBackground, GlassCard, Navbar, ScoreCircle, LoadingSpinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  GitCompare,
  X,
  TrendingUp,
  Target,
  MessageCircle,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { listValidations, getValidation, Validation, FullValidation } from "@/services/validationService";

interface IdeaWithReport {
  id: string;
  idea: string;
  fullIdea: string;
  score: number;
  dimensions: { dimension: string; score: number }[];
  metrics: { notes: number; likes: number; comments: number; sentiment: number };
}

const RADAR_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))"];

const Compare = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [availableIdeas, setAvailableIdeas] = useState<IdeaWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchValidations = async () => {
      try {
        const validations = await listValidations();
        
        // 获取每个验证的详细报告
        const ideasWithReports = await Promise.all(
          validations
            .filter(v => v.status === "completed" && v.overall_score !== null)
            .slice(0, 10) // 限制最多10个
            .map(async (validation) => {
              try {
                const fullData = await getValidation(validation.id);
                const report = fullData.report;
                
                return {
                  id: validation.id,
                  idea: validation.idea.length > 15 ? validation.idea.slice(0, 15) + "..." : validation.idea,
                  fullIdea: validation.idea,
                  score: validation.overall_score || 0,
                  dimensions: report?.dimensions || [
                    { dimension: "市场需求", score: 0 },
                    { dimension: "竞争环境", score: 0 },
                    { dimension: "盈利潜力", score: 0 },
                    { dimension: "可行性", score: 0 },
                    { dimension: "风险程度", score: 0 },
                    { dimension: "创新性", score: 0 },
                  ],
                  metrics: {
                    notes: report?.xiaohongshu_data?.totalNotes || 0,
                    likes: report?.xiaohongshu_data?.avgLikes || 0,
                    comments: report?.xiaohongshu_data?.avgComments || 0,
                    sentiment: report?.sentiment_analysis?.positive || 0,
                  },
                };
              } catch {
                return null;
              }
            })
        );

        const validIdeas = ideasWithReports.filter((item): item is IdeaWithReport => item !== null);
        setAvailableIdeas(validIdeas);
        
        // 默认选择前两个
        if (validIdeas.length >= 2) {
          setSelectedIds([validIdeas[0].id, validIdeas[1].id]);
        } else if (validIdeas.length === 1) {
          setSelectedIds([validIdeas[0].id]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取数据失败");
      } finally {
        setLoading(false);
      }
    };

    fetchValidations();
  }, []);

  const selectedIdeas = availableIdeas.filter(idea => selectedIds.includes(idea.id));

  const handleAddIdea = (id: string) => {
    if (selectedIds.length < 3 && !selectedIds.includes(id)) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleRemoveIdea = (id: string) => {
    setSelectedIds(selectedIds.filter(i => i !== id));
  };

  // 准备雷达图数据
  const radarData = selectedIdeas[0]?.dimensions.map((dim, index) => {
    const result: Record<string, string | number> = { dimension: dim.dimension };
    selectedIdeas.forEach((idea) => {
      result[idea.idea] = idea.dimensions[index]?.score || 0;
    });
    return result;
  }) || [];

  // 准备柱状图数据
  const barData = [
    { name: "笔记数", ...Object.fromEntries(selectedIdeas.map(i => [i.idea, i.metrics.notes / 100])) },
    { name: "点赞数", ...Object.fromEntries(selectedIdeas.map(i => [i.idea, i.metrics.likes])) },
    { name: "评论数", ...Object.fromEntries(selectedIdeas.map(i => [i.idea, i.metrics.comments * 5])) },
    { name: "好评率", ...Object.fromEntries(selectedIdeas.map(i => [i.idea, i.metrics.sentiment * 10])) },
  ];

  if (loading) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4 flex items-center justify-center min-h-screen">
          <LoadingSpinner size="lg" />
        </main>
      </PageBackground>
    );
  }

  if (error) {
    return (
      <PageBackground showClouds={false}>
        <Navbar />
        <main className="pt-28 pb-16 px-4">
          <div className="max-w-6xl mx-auto">
            <GlassCard className="text-center py-16">
              <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">加载失败</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/history">
                  <Sparkles className="w-4 h-4 mr-2" />
                  查看历史记录
                </Link>
              </Button>
            </GlassCard>
          </div>
        </main>
      </PageBackground>
    );
  }

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              对比分析
            </h1>
            <p className="text-muted-foreground">
              对比多个创意的验证结果，找出最佳选择
            </p>
          </div>

          {availableIdeas.length === 0 ? (
            <GlassCard className="text-center py-16 animate-slide-up">
              <GitCompare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                暂无可对比的验证记录
              </h3>
              <p className="text-muted-foreground mb-6">
                请先完成至少两个创意验证后再进行对比分析
              </p>
              <Button asChild className="rounded-xl ghibli-gradient">
                <Link to="/validate">
                  <Sparkles className="w-4 h-4 mr-2" />
                  开始验证创意
                </Link>
              </Button>
            </GlassCard>
          ) : (
            <>
              {/* Selection Area */}
              <GlassCard className="mb-8 animate-slide-up">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {selectedIdeas.map((idea, index) => (
                      <Badge
                        key={idea.id}
                        variant="outline"
                        className="px-4 py-2 text-sm"
                        style={{ 
                          borderColor: RADAR_COLORS[index],
                          color: RADAR_COLORS[index]
                        }}
                      >
                        {idea.idea}
                        <button 
                          onClick={() => handleRemoveIdea(idea.id)}
                          className="ml-2 hover:opacity-70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    {selectedIdeas.length === 0 && (
                      <span className="text-muted-foreground">请选择要对比的创意</span>
                    )}
                  </div>
                  
                  {selectedIds.length < 3 && availableIdeas.length > selectedIds.length && (
                    <Select onValueChange={handleAddIdea}>
                      <SelectTrigger className="w-[200px] rounded-xl">
                        <SelectValue placeholder="添加对比项..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableIdeas
                          .filter(idea => !selectedIds.includes(idea.id))
                          .map(idea => (
                            <SelectItem key={idea.id} value={idea.id}>
                              {idea.idea} ({idea.score}分)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </GlassCard>

              {selectedIdeas.length < 2 ? (
                <GlassCard className="text-center py-16 animate-slide-up">
                  <GitCompare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    选择至少两个创意进行对比
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    从上方选择器中添加要对比的验证记录
                  </p>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to="/history">
                      <Sparkles className="w-4 h-4 mr-2" />
                      查看历史记录
                    </Link>
                  </Button>
                </GlassCard>
              ) : (
                <>
                  {/* Score Comparison Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {selectedIdeas.map((idea, index) => (
                      <GlassCard 
                        key={idea.id}
                        className="text-center animate-slide-up"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div 
                          className="w-3 h-3 rounded-full mx-auto mb-4"
                          style={{ backgroundColor: RADAR_COLORS[index] }}
                        />
                        <h3 className="font-semibold text-foreground mb-4 truncate" title={idea.fullIdea}>
                          {idea.idea}
                        </h3>
                        <ScoreCircle score={idea.score} size="md" label="综合评分" />
                        
                        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="font-semibold text-foreground">{idea.metrics.notes.toLocaleString()}</div>
                            <div className="text-muted-foreground">相关笔记</div>
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{idea.metrics.sentiment}%</div>
                            <div className="text-muted-foreground">好评率</div>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Radar Chart */}
                    <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        多维度对比
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid stroke="hsl(var(--border))" />
                            <PolarAngleAxis dataKey="dimension" stroke="hsl(var(--muted-foreground))" />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                            {selectedIdeas.map((idea, index) => (
                              <Radar
                                key={idea.id}
                                name={idea.idea}
                                dataKey={idea.idea}
                                stroke={RADAR_COLORS[index]}
                                fill={RADAR_COLORS[index]}
                                fillOpacity={0.2}
                              />
                            ))}
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "12px"
                              }} 
                            />
                            <Legend />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </GlassCard>

                    {/* Bar Chart */}
                    <GlassCard className="animate-slide-up" style={{ animationDelay: "250ms" }}>
                      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-secondary" />
                        数据指标对比
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barData}>
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
                            <Legend />
                            {selectedIdeas.map((idea, index) => (
                              <Bar 
                                key={idea.id}
                                dataKey={idea.idea} 
                                fill={RADAR_COLORS[index]}
                                radius={[4, 4, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </GlassCard>
                  </div>

                  {/* Summary */}
                  <GlassCard className="animate-slide-up" style={{ animationDelay: "300ms" }}>
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-accent" />
                      对比总结
                    </h3>
                    <div className="space-y-4 text-muted-foreground">
                      {(() => {
                        const sorted = [...selectedIdeas].sort((a, b) => b.score - a.score);
                        const best = sorted[0];
                        return (
                          <>
                            <p>
                              在选择的 {selectedIdeas.length} 个创意中，
                              <span className="text-foreground font-medium">「{best.idea}」</span>
                              的综合评分最高（{best.score}分），具有较好的市场前景。
                            </p>
                            <p>
                              从市场需求来看，
                              {sorted.map((idea, i) => (
                                <span key={idea.id}>
                                  「{idea.idea}」{i < sorted.length - 1 ? '、' : ''}
                                </span>
                              ))}
                              的市场热度依次递减。
                            </p>
                            <p className="text-primary">
                              建议优先考虑「{best.idea}」项目，但也要注意其潜在风险和竞争环境。
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </GlassCard>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </PageBackground>
  );
};

export default Compare;