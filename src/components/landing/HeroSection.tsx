import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  Search,
  BarChart3,
  Brain,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { captureEvent } from "@/lib/posthog";

/* ── spring config ─────────────────────────── */
const spring = { type: "spring" as const, stiffness: 100, damping: 12 };
const springFast = { type: "spring" as const, stiffness: 200, damping: 18 };

/* ── variants ──────────────────────────────── */
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: spring },
};

/* ── props ─────────────────────────────────── */
interface HeroSectionProps {
  heroIdea: string;
  setHeroIdea: (v: string) => void;
  validationCount: number;
}

/* ── main component ────────────────────────── */
export function HeroSection({
  heroIdea,
  setHeroIdea,
}: HeroSectionProps) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const { t } = useTranslation();

  const heroHighlights = [
    { icon: Search, label: t("landing.pill1") },
    { icon: BarChart3, label: t("landing.pill2") },
    { icon: Brain, label: t("landing.pill3") },
  ];

  const goValidate = () => {
    captureEvent("cta_clicked", { button: "hero_validate", page: "index" });
    navigate(
      heroIdea.trim()
        ? `/validate?idea=${encodeURIComponent(heroIdea.trim())}`
        : "/validate"
    );
  };

  return (
    <section className="hero-shell mb-24 section-breathe">
      <div className="hero-surface">
        <motion.div
          className="hero-copy text-center items-center mx-auto max-w-3xl"
          variants={containerVariants}
          initial={reducedMotion ? "visible" : "hidden"}
          animate="visible"
        >
          {/* badge */}
          <motion.div variants={itemVariants}>
            <motion.div
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 text-primary shadow-lg shadow-primary/10"
              whileHover={{ scale: 1.05, y: -2 }}
              transition={springFast}
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="text-sm font-medium">
                {t("landing.badge")}
              </span>
            </motion.div>
          </motion.div>

          {/* title */}
          <motion.div variants={itemVariants}>
            <h1 className="hero-title mx-auto text-4xl md:text-6xl lg:text-[5.3rem] font-bold text-foreground mb-6 tracking-tight">
              {t("landing.heroTitle1")}
              <span className="text-gradient-animated">{t("landing.heroTitle2")}</span>
            </h1>
            <p className="hero-description mx-auto text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed text-pretty">
              {t("landing.heroDescPlain")}
            </p>
          </motion.div>

          {/* highlight pills */}
          <motion.div
            className="flex flex-wrap justify-center gap-3"
            variants={itemVariants}
          >
            {heroHighlights.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  className="hero-highlight-pill"
                  whileHover={{ y: -3, scale: 1.04 }}
                  transition={springFast}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  custom={i}
                >
                  <Icon className="w-4 h-4 text-primary" />
                  <span>{item.label}</span>
                </motion.div>
              );
            })}
          </motion.div>

          {/* command panel */}
          <motion.div
            className="w-full max-w-2xl"
            variants={itemVariants}
          >
            <motion.div
              className="hero-command-panel focus-indicator"
              whileHover={{ scale: 1.01 }}
              transition={springFast}
            >
              <Input
                placeholder={t("landing.inputPlaceholder")}
                value={heroIdea}
                onChange={(e) => setHeroIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && heroIdea.trim()) {
                    captureEvent("cta_clicked", {
                      button: "hero_inline_input",
                      page: "index",
                    });
                    navigate(
                      `/validate?idea=${encodeURIComponent(heroIdea.trim())}`
                    );
                  }
                }}
                className="hero-command-input input-cat-focus"
              />
              <motion.div
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                transition={springFast}
              >
                <Button
                  size="lg"
                  data-tour="validate"
                  className="hero-command-button btn-ripple paw-press"
                  onClick={goValidate}
                >
                  {t("landing.validateNow")}
                  <ArrowRight className="w-5 h-5 ml-1.5" />
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* scroll cue */}
      <motion.a
        href="#landing-features"
        className="hero-scroll-cue"
        animate={{ y: [0, 6, 0] }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        whileHover={{ scale: 1.06 }}
        onClick={() =>
          captureEvent("cta_clicked", {
            button: "hero_scroll_cue",
            page: "index",
          })
        }
      >
        <span>{t("landing.scrollCue")}</span>
        <ArrowRight className="w-4 h-4" />
      </motion.a>
    </section>
  );
}
