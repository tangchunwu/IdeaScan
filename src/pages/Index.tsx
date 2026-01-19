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
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Search,
    title: "小红书数据抓取",
    description: "实时抓取小红书相关笔记、评论数据，获取一手市场信息",
  },
  {
    icon: BarChart3,
    title: "多维度数据分析",
    description: "点赞、收藏、评论等多维度数据统计，直观了解市场热度",
  },
  {
    icon: Brain,
    title: "DeepSeek AI 分析",
    description: "基于 AI 深度分析市场可行性，提供专业商业建议",
  },
  {
    icon: FileText,
    title: "智能报告生成",
    description: "自动生成完整验证报告，包含市场分析、情感分析、可行性评估",
  },
];

const Index = () => {
  return (
    <PageBackground>
      <Navbar />
      
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <section className="text-center mb-20 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI 驱动的商业创意验证</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              将你的
              <span className="text-gradient"> 创意想法 </span>
              <br />
              变成
              <span className="text-gradient"> 可行方案 </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              基于小红书真实数据，结合 DeepSeek AI 智能分析，
              <br className="hidden md:block" />
              帮你快速验证商业创意的市场可行性
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-lg px-8 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all">
                <Link to="/validate">
                  开始验证
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6 rounded-2xl glass-button">
                <Link to="/history">
                  查看历史记录
                </Link>
              </Button>
            </div>
          </section>

          {/* Features Grid */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
              核心功能
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <GlassCard 
                    key={feature.title} 
                    hover
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </section>

          {/* How it works */}
          <section className="mb-20">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
              如何使用
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: "01", title: "输入创意", desc: "描述你的商业创意或产品想法" },
                { step: "02", title: "数据分析", desc: "AI 自动抓取分析小红书相关数据" },
                { step: "03", title: "获取报告", desc: "查看详细的可行性分析报告" },
              ].map((item, index) => (
                <GlassCard key={item.step} className="text-center animate-slide-up" style={{ animationDelay: `${index * 150}ms` } as React.CSSProperties}>
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-ghibli-sunset text-accent-foreground text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </GlassCard>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section className="text-center">
            <GlassCard className="ghibli-glow py-12 px-8" glow>
              <MessageCircle className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                准备好验证你的创意了吗？
              </h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                只需几分钟，就能获得基于真实数据的商业可行性分析
              </p>
              <Button asChild size="lg" className="text-lg px-10 py-6 rounded-2xl">
                <Link to="/validate">
                  立即开始
                  <Sparkles className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </GlassCard>
          </section>
        </div>
      </main>
    </PageBackground>
  );
};

export default Index;
