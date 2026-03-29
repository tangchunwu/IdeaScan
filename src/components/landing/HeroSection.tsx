import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useMotionValue,
  useTransform,
  useInView,
  useReducedMotion,
  animate,
  type Variants,
} from "framer-motion";
import {
  Sparkles,
  Search,
  BarChart3,
  Brain,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/shared/GlassCard";
import { captureEvent } from "@/lib/posthog";

/* ── data ──────────────────────────────────── */
const heroHighlights = [
  { icon: Search, label: "真实痛点抓取" },
  { icon: BarChart3, label: "竞品拥挤度计算" },
  { icon: Brain, label: "多角色 AI 对辩" },
];

const heroSignals = [
  { label: "小红书痛点信号", value: 82, detail: "近 72 小时持续抬升" },
  { label: "竞品拥挤度", value: 41, detail: "还有切入空档" },
  { label: "伪需求风险", value: 28, detail: "更像可验证机会" },
];


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

const panelVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...spring, delay: 0.3 },
  },
};

/* ── counter hook ──────────────────────────── */
function AnimatedCounter({
  value,
  suffix = "",
  reducedMotion = false,
}: {
  value: number;
  suffix?: string;
  reducedMotion?: boolean;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: () => setDisplay(rounded.get()),
    });
    return controls.stop;
  }, [value, reducedMotion, mv, rounded]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

/* ── signal bar ────────────────────────────── */
function SignalBar({
  item,
  reducedMotion,
}: {
  item: (typeof heroSignals)[number];
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [pct, setPct] = useState(reducedMotion ? item.value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      setPct(item.value);
      return;
    }
    const ctrl = animate(mv, item.value, {
      duration: 1,
      ease: "easeOut",
      onUpdate: () => setPct(rounded.get()),
    });
    return ctrl.stop;
  }, [inView, item.value, reducedMotion, mv, rounded]);

  return (
    <motion.div
      ref={ref}
      className="hero-signal-card"
      whileHover={{ borderColor: "hsl(var(--primary) / 0.35)" }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-foreground">{item.label}</div>
        <div className="text-sm number-highlight text-primary">{pct}%</div>
      </div>
      <div className="hero-signal-track">
        <motion.div
          className="hero-signal-fill"
          initial={{ width: 0 }}
          animate={inView ? { width: `${item.value}%` } : { width: 0 }}
          transition={{ duration: reducedMotion ? 0 : 1, ease: "easeOut" }}
        />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{item.detail}</div>
    </motion.div>
  );
}

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
  validationCount,
}: HeroSectionProps) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;

  // mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glowX = useTransform(mouseX, [-400, 400], [-12, 12]);
  const glowY = useTransform(mouseY, [-400, 400], [-10, 10]);
  const glowX2 = useTransform(mouseX, [-400, 400], [8, -8]);
  const glowY2 = useTransform(mouseY, [-400, 400], [6, -6]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const goValidate = () => {
    captureEvent("cta_clicked", { button: "hero_validate", page: "index" });
    navigate(
      heroIdea.trim()
        ? `/validate?idea=${encodeURIComponent(heroIdea.trim())}`
        : "/validate"
    );
  };

  return (
    <section
      className="hero-shell mb-24 section-breathe"
      onMouseMove={handleMouseMove}
    >
      <div className="hero-surface">
        <div className="hero-grid">
          {/* ── left: copy ─────────────────── */}
          <motion.div
            className="hero-copy"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* badge */}
            <motion.div className="hero-copy-item" variants={itemVariants} style={{ opacity: 1 }}>
              <motion.div
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 text-primary shadow-lg shadow-primary/10"
                whileHover={{ scale: 1.05, y: -2 }}
                transition={springFast}
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="text-sm font-medium">
                  在写第一行代码前，先验证需求
                </span>
              </motion.div>
            </motion.div>

            {/* title */}
            <motion.div className="hero-copy-item" variants={itemVariants} style={{ opacity: 1 }}>
              <h1 className="hero-title text-4xl md:text-6xl lg:text-[5.3rem] font-bold text-foreground mb-6 tracking-tight">
                先判断这是不是
                <span className="text-gradient-animated">值得做的真需求</span>
              </h1>
              <p className="hero-description text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed text-pretty">
                抓取
                <span className="font-semibold text-foreground">
                  {" "}小红书真实用户痛点{" "}
                </span>
                、全网竞品动态和趋势变化，再让
                <span className="font-semibold text-foreground">
                  {" "}4 位 AI 专家交叉拷问{" "}
                </span>
                你的商业想法。
              </p>
            </motion.div>

            {/* highlight pills */}
            <motion.div
              className="hero-copy-item flex flex-wrap gap-3"
              variants={itemVariants}
              style={{ opacity: 1 }}
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
              className="hero-copy-item max-w-2xl"
              variants={itemVariants}
              style={{ opacity: 1 }}
            >
              <motion.div
                className="hero-command-panel focus-indicator"
                whileHover={{ scale: 1.01 }}
                transition={springFast}
              >
                <Input
                  placeholder="一句话描述你的创业想法..."
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
                    立即验证
                    <ArrowRight className="w-5 h-5 ml-1.5" />
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* ── right: stage panel ─────────── */}
          <motion.div
            className="hero-copy-item"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            style={{ opacity: 1 }}
          >
            <div
              className="hero-stage"
              aria-hidden="true"
            >
              <div className="hero-stage-grid" />
              <motion.div
                className="hero-stage-glow hero-stage-glow-primary"
                style={reducedMotion ? {} : { x: glowX, y: glowY }}
              />
              <motion.div
                className="hero-stage-glow hero-stage-glow-secondary"
                style={reducedMotion ? {} : { x: glowX2, y: glowY2 }}
              />

              <GlassCard
                elevated
                padding="none"
                className="hero-stage-panel"
              >
                <div className="hero-stage-beam" />

                <div className="relative z-10 p-6 md:p-7">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-primary/70 mb-2">
                        Demand Signal Engine
                      </div>
                      <div className="text-2xl font-semibold text-foreground">
                        创意情报面板
                      </div>
                    </div>
                    <div className="hero-status-pill">
                      <span className="hero-status-dot" />
                      <span>实时研判中</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {heroSignals.map((item) => (
                      <SignalBar
                        key={item.label}
                        item={item}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </div>

                  <div className="hero-stage-divider" />

                  <motion.div
                    className="grid grid-cols-2 gap-4"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.12, delayChildren: 0.8 } },
                    }}
                  >
                    {[
                      {
                        sub: "当前判断",
                        title: "倾向真实需求",
                        desc: "痛点频率高于同类竞品密度",
                      },
                      {
                        sub: "建议动作",
                        title: "先做 MVP 验证",
                        desc: "聚焦一个高频场景快速试水",
                      },
                    ].map((v) => (
                      <motion.div
                        key={v.sub}
                        className="hero-verdict-card"
                        variants={{
                          hidden: { opacity: 0, y: 16 },
                          visible: { opacity: 1, y: 0, transition: spring },
                        }}
                      >
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
                          {v.sub}
                        </div>
                        <div className="text-lg font-semibold text-foreground mb-1">
                          {v.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {v.desc}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </GlassCard>
            </div>
          </motion.div>
        </div>
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
        <span>继续下滑看能力拆解</span>
        <ArrowRight className="w-4 h-4" />
      </motion.a>
    </section>
  );
}
