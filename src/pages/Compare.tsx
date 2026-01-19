import { useState } from "react";
import { PageBackground, GlassCard, Navbar, ScoreCircle } from "@/components/shared";
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
  Plus,
  X,
  TrendingUp,
  Target,
  Users,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

// 模拟可对比的历史数据
const availableIdeas = [
  {
    id: "1",
    idea: "猫咪主题咖啡店",
    fullIdea: "开一家专门做猫咪主题下午茶的咖啡店",
    score: 78,
    dimensions: [
      { dimension: "市场需求", score: 85 },
      { dimension: "竞争环境", score: 65 },
      { dimension: "盈利潜力", score: 72 },
      { dimension: "可行性", score: 80 },
      { dimension: "风险程度", score: 70 },
      { dimension: "创新性", score: 88 },
    ],
    metrics: { notes: 12580, likes: 856, comments: 123, sentiment: 68 },
  },
  {
    id: "2",
    idea: "时间管理APP",
    fullIdea: "设计一款帮助职场人管理时间的APP",
    score: 85,
    dimensions: [
      { dimension: "市场需求", score: 90 },
      { dimension: "竞争环境", score: 55 },
      { dimension: "盈利潜力", score: 82 },
      { dimension: "可行性", score: 88 },
      { dimension: "风险程度", score: 75 },
      { dimension: "创新性", score: 70 },
    ],
    metrics: { notes: 8320, likes: 1250, comments: 280, sentiment: 75 },
  },
  {
    id: "3",
    idea: "手工皮具网店",
    fullIdea: "做手工皮具定制的网店",
    score: 62,
    dimensions: [
      { dimension: "市场需求", score: 58 },
      { dimension: "竞争环境", score: 72 },
      { dimension: "盈利潜力", score: 65 },
      { dimension: "可行性", score: 60 },
      { dimension: "风险程度", score: 55 },
      { dimension: "创新性", score: 62 },
    ],
    metrics: { notes: 4560, likes: 520, comments: 85, sentiment: 58 },
  },
  {
    id: "4",
    idea: "本地美食小程序",
    fullIdea: "开发一个本地美食探店小程序",
    score: 71,
    dimensions: [
      { dimension: "市场需求", score: 75 },
      { dimension: "竞争环境", score: 50 },
      { dimension: "盈利潜力", score: 68 },
      { dimension: "可行性", score: 78 },
      { dimension: "风险程度", score: 72 },
      { dimension: "创新性", score: 65 },
    ],
    metrics: { notes: 6890, likes: 780, comments: 156, sentiment: 62 },
  },
  {
    id: "5",
    idea: "线上瑜伽平台",
    fullIdea: "创办线上瑜伽课程平台",
    score: 88,
    dimensions: [
      { dimension: "市场需求", score: 92 },
      { dimension: "竞争环境", score: 68 },
      { dimension: "盈利潜力", score: 85 },
      { dimension: "可行性", score: 90 },
      { dimension: "风险程度", score: 82 },
      { dimension: "创新性", score: 75 },
    ],
    metrics: { notes: 15680, likes: 1890, comments: 420, sentiment: 82 },
  },
];

const RADAR_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))"];

const Compare = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>(["1", "2"]);

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
      result[idea.idea] = idea.dimensions[index].score;
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
              </div>
              
              {selectedIds.length < 3 && (
                <Select onValueChange={handleAddIdea}>
                  <SelectTrigger className="w-[200px] rounded-xl">
                    <SelectValue placeholder="添加对比项..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableIdeas
                      .filter(idea => !selectedIds.includes(idea.id))
                      .map(idea => (
                        <SelectItem key={idea.id} value={idea.id}>
                          {idea.idea}
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
        </div>
      </main>
    </PageBackground>
  );
};

export default Compare;
