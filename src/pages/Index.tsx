import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureEvent } from "@/lib/posthog";

const featureIcons = [Search, BarChart3, Users, ShieldAlert];
const featureGradients = [
  "from-primary to-ghibli-sky",
  "from-secondary to-ghibli-forest",
  "from-accent to-ghibli-sunset",
  "from-primary to-secondary",
];

const stepIcons = [Sparkles, Zap, Target];

const Index = () => {
  const [heroIdea, setHeroIdea] = useState("");
  const { t } = useTranslation();

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

  const features = [
    { icon: featureIcons[0], title: t("landing.feature1Title"), description: t("landing.feature1Desc"), gradient: featureGradients[0] },
    { icon: featureIcons[1], title: t("landing.feature2Title"), description: t("landing.feature2Desc"), gradient: featureGradients[1] },
    { icon: featureIcons[2], title: t("landing.feature3Title"), description: t("landing.feature3Desc"), gradient: featureGradients[2] },
    { icon: featureIcons[3], title: t("landing.feature4Title"), description: t("landing.feature4Desc"), gradient: featureGradients[3] },
  ];

  const steps = [
    { step: "01", title: t("landing.step1Title"), desc: t("landing.step1Desc"), icon: stepIcons[0] },
    { step: "02", title: t("landing.step2Title"), desc: t("landing.step2Desc"), icon: stepIcons[1] },
    { step: "03", title: t("landing.step3Title"), desc: t("landing.step3Desc"), icon: stepIcons[2] },
  ];

  useDocumentTitle(t("landing.pageTitle"));

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

          {/* Social proof — scroll reveal */}
          <ScrollReveal className="mb-24">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <SocialProofCounter
                count={validationCount ?? 0}
                label={t("landing.socialProofLabel")}
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
                <span>{t("landing.sampleReport")}</span>
              </motion.a>
            </div>
          </ScrollReveal>

          {/* Features Grid */}
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
                {t("landing.featuresTitle")}
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                {t("landing.featuresDesc")}
              </p>
            </div>

            <div data-tour="features" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={i}
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

          {/* Testimonials */}
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
                {t("landing.stepsTitle")}
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                {t("landing.stepsDesc")}
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

          {/* Trending */}
          <motion.section
            className="mb-24 section-breathe"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
                {t("landing.trendsTitle")}
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                {t("landing.trendsDesc")}
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
                  {t("landing.ctaTitle")}
                </h2>
                <p className="text-muted-foreground mb-10 max-w-lg mx-auto text-lg">
                  {t("landing.ctaDesc")}
                </p>
                <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}>
                  <Button
                    asChild
                    size="lg"
                    className="text-lg px-12 py-7 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl transition-all duration-300"
                  >
                    <Link to="/validate">
                      {t("landing.ctaButton")}
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
              {t("landing.footerDesc")}
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-6 text-foreground">{t("landing.footerProduct")}</h4>
            <ul className="space-y-4">
              <li><Link to="/validate" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerStartValidation")}</Link></li>
              <li><Link to="/discover" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerDiscover")}</Link></li>
              <li><Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerPricing")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-6 text-foreground">{t("landing.footerSupport")}</h4>
            <ul className="space-y-4">
              <li><Link to="/faq" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerFaq")}</Link></li>
              <li><Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerPrivacy")}</Link></li>
              <li><Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">{t("landing.footerTerms")}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pt-8 border-t border-border/10 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground">
          <div>© {new Date().getFullYear()} IdeaScan. All rights reserved.</div>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link to="/privacy" className="hover:text-primary transition-colors">{t("landing.footerPrivacy")}</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">{t("landing.footerTerms")}</Link>
          </div>
        </div>
      </footer>
      <OnboardingTour />
    </PageBackground>
  );
};

export default Index;
