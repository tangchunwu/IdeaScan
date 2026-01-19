import { useParams, Link } from "react-router-dom";
import { PageBackground, GlassCard, Navbar, ScoreCircle } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Users,
  MessageCircle,
  Heart,
  Bookmark,
  Share2,
  Brain,
  Target,
  AlertTriangle,
  CheckCircle,
  Download,
  ArrowLeft,
  Calendar,
  BarChart3,
  PieChartIcon,
  Activity,
} from "lucide-react";

// 模拟报告数据 - 实际使用时从API获取
const mockReportData = {
  id: "demo-123",
  idea: "开一家专门做猫咪主题下午茶的咖啡店",
  createdAt: "2024-01-15",
  overallScore: 78,
  
  // 市场分析
  marketAnalysis: {
    targetAudience: "年轻女性（18-35岁）、宠物爱好者、追求生活品质的都市人群",
    marketSize: "中大型",
    competitionLevel: "中等",
    trendDirection: "上升",
    keywords: ["猫咪咖啡", "宠物友好", "下午茶", "网红打卡"],
  },
  
  // 小红书数据
  xiaohongshuData: {
    totalNotes: 12580,
    avgLikes: 856,
    avgComments: 123,
    avgCollects: 432,
    totalEngagement: 17654320,
    weeklyTrend: [
      { name: "周一", value: 1200 },
      { name: "周二", value: 1350 },
      { name: "周三", value: 1100 },
      { name: "周四", value: 1580 },
      { name: "周五", value: 1890 },
      { name: "周六", value: 2340 },
      { name: "周日", value: 2120 },
    ],
    contentTypes: [
      { name: "探店分享", value: 45 },
      { name: "猫咪互动", value: 30 },
      { name: "美食推荐", value: 15 },
      { name: "环境氛围", value: 10 },
    ],
  },
  
  // 情感分析
  sentimentAnalysis: {
    positive: 68,
    neutral: 22,
    negative: 10,
    topPositive: ["环境很好", "猫咪可爱", "拍照出片", "服务态度好"],
    topNegative: ["价格偏高", "排队时间长", "猫咪有时不亲人"],
  },
  
  // AI 分析建议
  aiAnalysis: {
    feasibilityScore: 78,
    strengths: [
      "市场需求旺盛，年轻群体对猫咪+咖啡概念接受度高",
      "小红书传播效应强，容易形成网红效应",
      "差异化竞争优势明显，主题明确",
      "情感价值高，用户粘性强",
    ],
    weaknesses: [
      "运营成本较高，需要专业的宠物护理",
      "卫生管理要求严格，存在食品安全风险",
      "依赖选址，需要足够的客流量",
      "季节性波动可能较大",
    ],
    suggestions: [
      "建议选址在年轻人聚集的商圈或写字楼附近",
      "重视社交媒体运营，培养网红猫咪",
      "考虑会员制度，提高用户复购率",
      "与宠物医院、猫舍建立合作关系",
      "制定严格的卫生管理制度",
    ],
    risks: [
      "政策风险：部分城市对宠物餐饮有限制",
      "运营风险：猫咪健康问题可能影响营业",
      "市场风险：同类竞争者增加",
    ],
  },
  
  // 综合评分维度
  dimensions: [
    { dimension: "市场需求", score: 85 },
    { dimension: "竞争环境", score: 65 },
    { dimension: "盈利潜力", score: 72 },
    { dimension: "可行性", score: 80 },
    { dimension: "风险程度", score: 70 },
    { dimension: "创新性", score: 88 },
  ],
};

const SENTIMENT_COLORS = ["hsl(var(--secondary))", "hsl(var(--muted))", "hsl(var(--destructive))"];
const CONTENT_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

const Report = () => {
  const { id } = useParams();
  const data = mockReportData; // 实际从API获取

  return (
    <PageBackground showClouds={false}>
      <Navbar />
      
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <Link to="/validate" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回验证
            </Link>
            
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                  验证报告
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl">
                  "{data.idea}"
                </p>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {data.createdAt}
                  </span>
                  <Badge variant="outline">报告 #{data.id}</Badge>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Button variant="outline" className="rounded-xl">
                  <Download className="w-4 h-4 mr-2" />
                  导出报告
                </Button>
                <Button variant="outline" className="rounded-xl">
                  <Share2 className="w-4 h-4 mr-2" />
                  分享
                </Button>
              </div>
            </div>
          </div>

          {/* Overall Score Card */}
          <GlassCard className="mb-8 ghibli-glow animate-slide-up">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 py-4">
              <div className="flex items-center gap-8">
                <ScoreCircle score={data.overallScore} size="lg" label="综合评分" />
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {data.overallScore >= 80 ? "强烈推荐" : data.overallScore >= 60 ? "值得尝试" : "需要谨慎"}
                  </h2>
                  <p className="text-muted-foreground">
                    基于 {data.xiaohongshuData.totalNotes.toLocaleString()} 篇小红书笔记分析
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{data.xiaohongshuData.totalNotes.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">相关笔记</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-secondary">{data.xiaohongshuData.avgLikes}</div>
                  <div className="text-sm text-muted-foreground">平均点赞</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent">{data.xiaohongshuData.avgComments}</div>
                  <div className="text-sm text-muted-foreground">平均评论</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-ghibli-sunset">{data.sentimentAnalysis.positive}%</div>
                  <div className="text-sm text-muted-foreground">正面评价</div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Tabs Content */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="glass-card p-1 w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview" className="rounded-lg">
                <BarChart3 className="w-4 h-4 mr-2" />
                概览
              </TabsTrigger>
              <TabsTrigger value="market" className="rounded-lg">
                <Target className="w-4 h-4 mr-2" />
                市场分析
              </TabsTrigger>
              <TabsTrigger value="sentiment" className="rounded-lg">
                <PieChartIcon className="w-4 h-4 mr-2" />
                情感分析
              </TabsTrigger>
              <TabsTrigger value="ai" className="rounded-lg">
                <Brain className="w-4 h-4 mr-2" />
                AI 建议
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trend Chart */}
                <GlassCard className="animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    一周热度趋势
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.xiaohongshuData.weeklyTrend}>
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
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={3}
                          dot={{ fill: "hsl(var(--primary))" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                {/* Radar Chart */}
                <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-secondary" />
                    多维度评分
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={data.dimensions}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="dimension" stroke="hsl(var(--muted-foreground))" />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                        <Radar
                          name="评分"
                          dataKey="score"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.3}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </div>

              {/* Content Type Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-accent" />
                    内容类型分布
                  </h3>
                  <div className="h-64 flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.xiaohongshuData.contentTypes}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {data.xiaohongshuData.contentTypes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CONTENT_COLORS[index % CONTENT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))", 
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px"
                          }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {data.xiaohongshuData.contentTypes.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 text-sm">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CONTENT_COLORS[index % CONTENT_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{item.name}</span>
                          <span className="font-medium text-foreground">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                {/* Key Metrics */}
                <GlassCard className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-ghibli-forest" />
                    关键指标
                  </h3>
                  <div className="space-y-4">
                    {[
                      { label: "总互动量", value: data.xiaohongshuData.totalEngagement.toLocaleString(), icon: Heart, color: "text-destructive" },
                      { label: "平均收藏", value: data.xiaohongshuData.avgCollects, icon: Bookmark, color: "text-accent" },
                      { label: "平均评论", value: data.xiaohongshuData.avgComments, icon: MessageCircle, color: "text-primary" },
                      { label: "目标用户", value: data.marketAnalysis.targetAudience.split("、")[0], icon: Users, color: "text-secondary" },
                    ].map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <div key={metric.label} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Icon className={`w-5 h-5 ${metric.color}`} />
                            <span className="text-muted-foreground">{metric.label}</span>
                          </div>
                          <span className="font-semibold text-foreground">{metric.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            {/* Market Analysis Tab */}
            <TabsContent value="market" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "市场规模", value: data.marketAnalysis.marketSize, icon: Target },
                  { label: "竞争程度", value: data.marketAnalysis.competitionLevel, icon: Users },
                  { label: "趋势方向", value: data.marketAnalysis.trendDirection, icon: TrendingUp },
                  { label: "热度评级", value: "高", icon: Activity },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <GlassCard key={item.label} className="text-center animate-slide-up">
                      <Icon className="w-8 h-8 text-primary mx-auto mb-2" />
                      <div className="text-xl font-bold text-foreground">{item.value}</div>
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                    </GlassCard>
                  );
                })}
              </div>

              <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4">目标用户画像</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {data.marketAnalysis.targetAudience}
                </p>
              </GlassCard>

              <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4">热门关键词</h3>
                <div className="flex flex-wrap gap-2">
                  {data.marketAnalysis.keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="px-4 py-2 text-sm bg-primary/10 text-primary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </GlassCard>
            </TabsContent>

            {/* Sentiment Analysis Tab */}
            <TabsContent value="sentiment" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4">情感分布</h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "正面", value: data.sentimentAnalysis.positive },
                            { name: "中性", value: data.sentimentAnalysis.neutral },
                            { name: "负面", value: data.sentimentAnalysis.negative },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name} ${value}%`}
                        >
                          {SENTIMENT_COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <div className="space-y-4">
                  <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-secondary" />
                      用户好评关键词
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {data.sentimentAnalysis.topPositive.map((item) => (
                        <Badge key={item} className="bg-secondary/10 text-secondary">{item}</Badge>
                      ))}
                    </div>
                  </GlassCard>

                  <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      用户吐槽关键词
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {data.sentimentAnalysis.topNegative.map((item) => (
                        <Badge key={item} variant="destructive" className="bg-destructive/10 text-destructive">{item}</Badge>
                      ))}
                    </div>
                  </GlassCard>
                </div>
              </div>
            </TabsContent>

            {/* AI Suggestions Tab */}
            <TabsContent value="ai" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard className="animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-secondary" />
                    优势分析
                  </h3>
                  <ul className="space-y-3">
                    {data.aiAnalysis.strengths.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-muted-foreground">
                        <span className="text-secondary mt-1">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </GlassCard>

                <GlassCard className="animate-slide-up" style={{ animationDelay: "100ms" }}>
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-accent" />
                    劣势分析
                  </h3>
                  <ul className="space-y-3">
                    {data.aiAnalysis.weaknesses.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-muted-foreground">
                        <span className="text-accent mt-1">!</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </div>

              <GlassCard className="animate-slide-up" style={{ animationDelay: "150ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  AI 商业建议
                </h3>
                <ul className="space-y-3">
                  {data.aiAnalysis.suggestions.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 p-3 rounded-xl bg-primary/5">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <GlassCard className="animate-slide-up border-destructive/20" style={{ animationDelay: "200ms" }}>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  风险提示
                </h3>
                <ul className="space-y-3">
                  {data.aiAnalysis.risks.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-destructive mt-1">⚠</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </PageBackground>
  );
};

export default Report;
