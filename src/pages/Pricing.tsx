import { PageBackground, Navbar, GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CheckCircle, Zap, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const Pricing = () => {
       const plans = [
              {
                     name: "免费版",
                     price: "¥0",
                     period: "/月",
                     description: "适合初次体验 AI 验证能力的个人创作者。",
                     features: [
                            "每月 3 次创意验证",
                            "基础 AI 分析报告",
                            "小红书数据概览",
                            "社区支持"
                     ],
                     cta: "开始免费使用",
                     ctaLink: "/validate",
                     variant: "outline"
              },
              {
                     name: "专业版",
                     price: "¥99",
                     period: "/月",
                     description: "为严肃的连续创业者和产品经理打造。",
                     features: [
                            "每月 50 次创意验证",
                            "深度 AI 商业分析 (SWOT/PEST)",
                            "竞品雷达 & 护城河分析",
                            "导出高清 PDF/HTML 报告",
                            "优先获取新功能"
                     ],
                     cta: "升级专业版",
                     ctaLink: "#",
                     popular: true,
                     variant: "default"
              },
              {
                     name: "企业版",
                     price: "定制",
                     period: "",
                     description: "针对需要 API 接入和团队协作的机构客户。",
                     features: [
                            "无限次创意验证",
                            "API 接口访问",
                            "团队协作与权限管理",
                            "专属客户经理",
                            "私有化部署支持"
                     ],
                     cta: "联系商务",
                     ctaLink: "mailto:business@ideascan.ai",
                     variant: "outline"
              }
       ];

       return (
              <PageBackground showClouds={true}>
                     <Navbar />
                     <main className="pt-32 pb-20 px-4">
                            <div className="max-w-7xl mx-auto">
                                   {/* Header */}
                                   <div className="text-center mb-16 animate-fade-in space-y-4">
                                          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                                                 选择适合您的计划
                                          </h1>
                                          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                                                 从灵感到落地，IdeaScan 全程为您提供数据支持。升级计划，解锁更强大的商业洞察力。
                                          </p>
                                   </div>

                                   {/* Pricing Grid */}
                                   <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                                          {plans.map((plan, index) => (
                                                 <div
                                                        key={index}
                                                        className={`relative animate-slide-up`}
                                                        style={{ animationDelay: `${index * 100}ms` }}
                                                 >
                                                        {/* Popular Badge */}
                                                        {plan.popular && (
                                                               <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                                                                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                                                                             <Sparkles className="w-3 h-3" />
                                                                             最受欢迎
                                                                      </div>
                                                               </div>
                                                        )}

                                                        <GlassCard
                                                               className={`h-full flex flex-col relative overflow-hidden transition-all duration-300 hover:translate-y-[-5px] ${plan.popular ? 'border-primary/50 shadow-2xl shadow-primary/10 ring-1 ring-primary/20' : 'hover:shadow-xl'
                                                                      }`}
                                                               padding="lg"
                                                        >
                                                               {/* Background Accents for Pro Plan */}
                                                               {plan.popular && (
                                                                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -z-10" />
                                                               )}

                                                               <div className="mb-6">
                                                                      <h3 className="text-lg font-semibold text-muted-foreground mb-2">{plan.name}</h3>
                                                                      <div className="flex items-baseline gap-1">
                                                                             <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                                                                             <span className="text-sm text-muted-foreground">{plan.period}</span>
                                                                      </div>
                                                                      <p className="text-sm text-muted-foreground mt-4 h-10">{plan.description}</p>
                                                               </div>

                                                               <div className="flex-1 space-y-4 mb-8">
                                                                      {plan.features.map((feature, i) => (
                                                                             <div key={i} className="flex items-start gap-3 text-sm group">
                                                                                    <CheckCircle className={`w-5 h-5 shrink-0 ${plan.popular ? 'text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'}`} />
                                                                                    <span className="text-foreground/80">{feature}</span>
                                                                             </div>
                                                                      ))}
                                                               </div>

                                                               <Link to={plan.ctaLink} className="w-full">
                                                                      <Button
                                                                             variant={(plan.variant as "default" | "outline") || "outline"}
                                                                             className={`w-full h-12 rounded-xl text-base font-medium shadow-lg transition-all ${plan.popular
                                                                                           ? 'bg-gradient-to-r from-primary to-secondary hover:opacity-90 hover:scale-[1.02]'
                                                                                           : 'hover:scale-[1.02]'
                                                                                    }`}
                                                                      >
                                                                             {plan.cta}
                                                                      </Button>
                                                               </Link>
                                                        </GlassCard>
                                                 </div>
                                          ))}
                                   </div>

                                   {/* FAQ or Trust Section (Optional) */}
                                   <div className="mt-24 text-center">
                                          <p className="text-muted-foreground mb-6">
                                                 不确定哪个计划适合您？
                                          </p>
                                          <div className="flex justify-center gap-8 text-sm text-muted-foreground/80">
                                                 <div className="flex items-center gap-2">
                                                        <Shield className="w-4 h-4" />
                                                        安全支付
                                                 </div>
                                                 <div className="flex items-center gap-2">
                                                        <Zap className="w-4 h-4" />
                                                        随时取消
                                                 </div>
                                          </div>
                                   </div>
                            </div>
                     </main>
              </PageBackground>
       );
};

export default Pricing;
