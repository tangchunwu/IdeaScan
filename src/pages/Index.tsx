import { useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PageBackground, GlassCard, Navbar, OnboardingTour, BrandLogo } from "@/components/shared";
import { ScrollReveal } from "@/components/shared/ScrollReveal";
import { SocialProofCounter } from "@/components/social";
import { HotTrends } from "@/components/discover/HotTrends";
import { TestimonialSection } from "@/components/landing/TestimonialSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  Users,
  Search,
  BarChart3,
  MessageCircle,
  Zap,
  ShieldAlert,
  Target,
  Brain,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureEvent } from "@/lib/posthog";

const features = [
  {
    icon: Search,
    title: "小红书真实痛点挖掘",
    description: "直接抓取小红书用户吐槽与需求，用真实声音验证市场是否存在，告别自嗨式创业。",
    gradient: "from-primary to-ghibli-sky",
  },
  {
    icon: BarChart3,
    title: "全网竞品情报分析",
    description: "聚合知乎、36氪、虎嗅等全网中文数据，量化分析竞争格局与市场拥挤度。",
    gradient: "from-secondary to-ghibli-forest",
  },
  {
    icon: Users,
    title: "创投圈 AI 辩论",
    description: "4位AI专家（犀利VC、杠精PM、Z世代用户、数据分析师）激烈辩论，全方位拷打你的想法。",
    gradient: "from-accent to-ghibli-sunset",
  },
  {
    icon: ShieldAlert,
    title: "伪需求检测引擎",
    description: "结合用户痛点频率与竞品密度，判断你的创意是真刚需还是自嗨伪需求。",
    gradient: "from-primary to-secondary",
  },
];

const heroMetrics = [
  { value: 4, suffix: "", label: "位 AI 辩手", icon: Brain },
  { value: 12, suffix: "+", label: "中文情报源", icon: TrendingUp },
  { value: 24, suffix: "h", label: "信号追踪", icon: MessageCircle },
];

const steps = [
  { step: "01", title: "描述你的想法", desc: "一句话说清楚你想做什么", icon: Sparkles },
  { step: "02", title: "AI 全网调研", desc: "抓取小红书痛点和竞品情报", icon: Zap },
  { step: "03", title: "需求验证报告", desc: "获取残酷诚实的市场反馈", icon: Target },
];

const Index = () => {
  const [heroIdea, setHeroIdea] = useState("");
  const { data: validationCount } = useQuery({
    queryKey: ['validation-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_completed_validation_count');
      if (error) throw error;
      return (data as number) || 0;
    },
    staleTime: 1000 * 60 * 10,
  });

  useDocumentTitle("在写代码前，先验证你的创业想法");

  return (
    <PageBackground variant="vibrant">
      <Navbar />

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <HeroSection
            heroIdea={heroIdea}
            setHeroIdea={setHeroIdea}
            validationCount={validationCount ?? 0}
          />

          {/* Social proof + metrics — scroll reveal */}
          <ScrollReveal className="mb-24">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
              <SocialProofCounter
                count={validationCount ?? 0}
                label="个创意已通过验证"
              />
              <motion.a
                href="https://ideascan.me/share/bb05ee712f6340cb"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-sample-link"
                whileHover={{ y: -2, scale: 1.03 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                onClick={() =>
                  captureEvent("cta_clicked", {
                    button: "hero_sample_report",
                    page: "index",
                  })
                }
              >
                <ExternalLink className="w-4 h-4" />
                <span>查看一份示例报告</span>
              </motion.a>
            </div>
          </ScrollReveal>

          {/* Signal panel — scroll reveal */}
          <ScrollReveal className="mb-24">
            <GlassCard elevated className="max-w-3xl mx-auto overflow-hidden">
              <div className="p-6 md:p-7">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-primary/70 mb-2">
                      Demand Signal Engine
                    </div>
                    <div className="text-2xl font-semibold text-foreground">
                      创意情报面板
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>实时研判中</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "小红书痛点信号", value: 82, detail: "近 72 小时持续抬升" },
                    { label: "竞品拥挤度", value: 41, detail: "还有切入空档" },
                    { label: "伪需求风险", value: 28, detail: "更像可验证机会" },
                  ].map((item, i) => (
                    <ScrollReveal key={item.label} delay={i * 120}>
                      <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          <div className="text-sm text-primary font-semibold">{item.value}%</div>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-muted/65">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{item.detail}</div>
                      </div>
                    </ScrollReveal>
                  ))}
                </div>

                <div className="h-px my-6 bg-gradient-to-r from-transparent via-border to-transparent" />

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { sub: "当前判断", title: "倾向真实需求", desc: "痛点频率高于同类竞品密度" },
                    { sub: "建议动作", title: "先做 MVP 验证", desc: "聚焦一个高频场景快速试水" },
                  ].map((v) => (
                    <ScrollReveal key={v.sub} delay={400}>
                      <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
                          {v.sub}
                        </div>
                        <div className="text-lg font-semibold text-foreground mb-1">
                          {v.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {v.desc}

                        </div>
                      </div>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            </GlassCard>
          </ScrollReveal>

681          {/* Metrics cards — scroll reveal */}
          <ScrollReveal className="mb-24">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {heroMetrics.map((item, i) => {
at                const Icon

 = item.icon;
                return (
                  <ScrollReveal key={item.label	} delay={i * 100}>
                    <motion.div
                      whileHover={{ y
: -4, scale: 1.03 }}
                      transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    >
                      <GlassCard className="hero-metric-card" padding="sm">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-muted-foreground">
                            {item.label}
                          </span>
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-3xl md:text-4xl number-highlight text-foreground">
                          {item.value}{item.suffix}
                        </div>
                      </GlassCard>
                    </motion.div>
                  </ScrollReveal>
                );
              })}
            </div>
          </ScrollReveal>

          {/* Features Grid - 功能层级清晰 */}
          <motion.section
            id="landing-features"
            className="mb-24 section-breathe"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                不只是分析，是残酷诚实的验证
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                用真实数据和多元视角，帮你避开"自嗨式创业"的坑
              </p>
            </div>

            <div data-tour="features" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", stiffness: 100, damping: 12, delay: i * 0.08 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                  >
                    <GlassCard hover interactive className="group h-full">
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
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          {/* Testimonials - 信任建设 */}
          <TestimonialSection />

          {/* How it works */}
          <motion.section
            className="mb-24 section-breathe"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                3 分钟完成需求验证
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                比写 PRD 还快，比问朋友更靠谱
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.step}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", stiffness: 100, damping: 12, delay: index * 0.1 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                  >
                    <GlassCard
                      className="text-center relative overflow-visible h-full"
                      elevated
                    >
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
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          {/* Popular Validations */}
          <motion.section
            className="mb-24 section-breathe"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                本周热门趋势
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                发现正在爆发的市场机会，抢占先机
              </p>
            </div>
            <div className="max-w-2xl mx-auto">
              <HotTrends limit={5} />
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section
            className="text-center"
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <GlassCard className="py-16 px-8 relative overflow-hidden" glow elevated>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
              <div className="relative z-10">
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <MessageCircle className="w-8 h-8 text-primary-foreground" />
                </motion.div>
                <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                  别让"伪需求"浪费你的半年
                </h2>
                <p className="text-muted-foreground mb-10 max-w-lg mx-auto text-lg">
                  写代码之前，先用真实数据验证你的想法值不值得做
                </p>
                <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}>
                  <Button
                    asChild
                    size="lg"
                    className="text-lg px-12 py-7 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl transition-all duration-300"
                  >
                    <Link to="/validate">
                      开始验证
                      <Sparkles className="w-5 h-5 ml-2" />
                    </Link>
                  </Button>
                </motion.div>
              </div>
            </GlassCard>
          </motion.section>
        </div>
      </main>
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm pt-16 pb-8">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-6">
              <BrandLogo size="md" variant="full" theme="color" />
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-sm">
              抓取小红书用户痛点和全网竞品数据，让4位AI专家辩论你的想法。在写第一行代码前，验证你的创意是真刚需还是伪需求。
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-6 text-foreground">产品</h4>
            <ul className="space-y-4">
              <li><Link to="/validate" className="text-muted-foreground hover:text-primary transition-colors">开始验证</Link></li>
              <li><Link to="/discover" className="text-muted-foreground hover:text-primary transition-colors">发现机会</Link></li>
              <li><Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors">定价方案</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-6 text-foreground">支持</h4>
            <ul className="space-y-4">
              <li><Link to="/faq" className="text-muted-foreground hover:text-primary transition-colors">常见问题</Link></li>
              <li><Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">隐私政策</Link></li>
              <li><Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">服务条款</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pt-8 border-t border-border/10 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground">
          <div>© {new Date().getFullYear()} IdeaScan. All rights reserved.</div>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link to="/privacy" className="hover:text-primary transition-colors">隐私政策</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">服务条款</Link>
          </div>
        </div>
      </footer>
      <OnboardingTour />
    </PageBackground>
  );
};

export default Index;
