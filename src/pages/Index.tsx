import { Link } from "react-router-dom";
import { PageBackground, GlassCard, Navbar } from "@/components/shared";
import { 
  Sparkles, 
  TrendingUp, 
  Brain, 
  FileText, 
  ArrowRight,
  Search,
  BarChart3,
  MessageCircle,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Search,
    title: "小红书数据抓取",
    description: "实时抓取小红书相关笔记、评论数据，获取一手市场信息",
    gradient: "from-primary to-ghibli-sky",
  },
  {
    icon: BarChart3,
    title: "多维度数据分析",
    description: "点赞、收藏、评论等多维度数据统计，直观了解市场热度",
    gradient: "from-secondary to-ghibli-forest",
  },
  {
    icon: Brain,
    title: "AI 深度分析",
    description: "基于 AI 深度分析市场可行性，提供专业商业建议",
    gradient: "from-accent to-ghibli-sunset",
  },
  {
    icon: FileText,
    title: "智能报告生成",
    description: "自动生成完整验证报告，包含市场分析、情感分析、可行性评估",
    gradient: "from-primary to-secondary",
  },
];

const steps = [
  { step: "01", title: "输入创意", desc: "描述你的商业创意或产品想法", icon: Sparkles },
  { step: "02", title: "数据分析", desc: "AI 自动抓取分析小红书相关数据", icon: Zap },
  { step: "03", title: "获取报告", desc: "查看详细的可行性分析报告", icon: TrendingUp },
];

const Index = () => {
  return (
    <PageBackground variant="vibrant">
      <Navbar />
      
      <main className="pt-28 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section - 用户第一认知焦点 */}
          <section className="text-center mb-24 section-breathe">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 text-primary mb-8 shadow-lg shadow-primary/10">
                <Sparkles className="w-4 h-4 animate-pulse-soft" />
                <span className="text-sm font-medium">AI 驱动的商业创意验证</span>
              </div>
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-8 leading-tight animate-fade-in-up">
              将你的
              <span className="text-gradient-animated"> 创意想法 </span>
              <br className="hidden sm:block" />
              变成
              <span className="text-gradient-animated"> 可行方案 </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 animate-fade-in-up leading-relaxed" style={{ animationDelay: "100ms" }}>
              基于小红书真实数据，结合 AI 智能分析，
              <br className="hidden md:block" />
              帮你快速验证商业创意的市场可行性
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <Button 
                asChild 
                size="lg" 
                className="text-lg px-10 py-7 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1 transition-all duration-300 btn-ripple"
              >
                <Link to="/validate">
                  开始验证
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg" 
                className="text-lg px-10 py-7 rounded-2xl glass-button border-border/50"
              >
                <Link to="/history">
                  查看历史记录
                </Link>
              </Button>
            </div>
          </section>

          {/* Features Grid - 功能层级清晰 */}
          <section className="mb-24 section-breathe">
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                核心功能
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                全方位的创意验证解决方案
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger-container">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <GlassCard 
                    key={feature.title} 
                    hover
                    interactive
                    className="group"
                  >
                    <div className="flex items-start gap-5">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                        <Icon className="w-7 h-7 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                          {feature.title}
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </section>

          {/* How it works - 用户认知引导 */}
          <section className="mb-24 section-breathe">
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                如何使用
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                三步完成创意验证
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 stagger-container">
              {steps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <GlassCard 
                    key={item.step} 
                    className="text-center relative overflow-visible"
                    elevated
                  >
                    {/* 连接线 */}
                    {index < steps.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                    )}
                    
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-ghibli-sunset text-accent-foreground text-2xl font-bold flex items-center justify-center mx-auto mb-6 shadow-xl shadow-accent/20 relative">
                      <span className="relative z-10">{item.step}</span>
                      <Icon className="absolute -bottom-2 -right-2 w-8 h-8 p-1.5 bg-background rounded-full text-accent shadow-lg" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">{item.title}</h3>
                    <p className="text-muted-foreground">{item.desc}</p>
                  </GlassCard>
                );
              })}
            </div>
          </section>

          {/* CTA Section - 行动召唤 */}
          <section className="text-center">
            <GlassCard className="py-16 px-8 relative overflow-hidden" glow elevated>
              {/* 装饰背景 */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20 animate-float">
                  <MessageCircle className="w-8 h-8 text-primary-foreground" />
                </div>
                <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                  准备好验证你的创意了吗？
                </h2>
                <p className="text-muted-foreground mb-10 max-w-lg mx-auto text-lg">
                  只需几分钟，就能获得基于真实数据的商业可行性分析
                </p>
                <Button 
                  asChild 
                  size="lg" 
                  className="text-lg px-12 py-7 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <Link to="/validate">
                    立即开始
                    <Sparkles className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
              </div>
            </GlassCard>
          </section>
        </div>
      </main>
    </PageBackground>
  );
};

export default Index;
