import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/shared/GlassCard";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { getSkinCopy } from "@/lib/skinMessages";

interface SkinEmptyStateProps {
  icon: LucideIcon;
  /** Override title — falls back to skin default */
  title?: string;
  /** Override description — falls back to skin default */
  description?: string;
  actionLabel?: string;
  actionLink?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * 皮肤感知空状态 — 根据当前皮肤自动切换插画、文案、CTA
 */
export const SkinEmptyState = ({
  icon: Icon,
  title: titleOverride,
  description: descOverride,
  actionLabel: actionOverride,
  actionLink,
  onAction,
  className,
}: SkinEmptyStateProps) => {
  const { skin } = useTheme();
  const copy = getSkinCopy(skin);

  const title = titleOverride || copy.emptyTitle;
  const description = descOverride || copy.emptyDescription;
  const actionLabel = actionOverride || copy.emptyCTA;

  // Cotton: soft illustration
  if (skin === "cotton") {
    return (
      <GlassCard className={`text-center py-16 animate-slide-up ${className || ""}`}>
        <motion.div
          className="mx-auto mb-6 relative w-24 h-24 flex items-center justify-center"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Empty teacup */}
          <svg width="80" height="80" viewBox="0 0 80 80" className="drop-shadow-sm">
            <rect x="14" y="20" width="40" height="48" rx="8" fill="hsl(var(--muted))" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1.5" />
            {/* Rabbit ear handle */}
            <path d="M54 34 C62 28 66 32 62 40 C60 44 56 44 54 42" fill="none" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M56 34 C61 30 64 33 61 39 C60 41 57 41 56 40" fill="hsl(var(--primary) / 0.1)" />
            {/* Lonely pearl at bottom */}
            <circle cx="34" cy="60" r="4" fill="hsl(var(--accent) / 0.5)" />
            {/* Cotton bunny peeking */}
            <motion.g
              animate={{ rotate: [-3, 3, -3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Bunny head */}
              <circle cx="34" cy="14" r="8" fill="hsl(var(--primary) / 0.3)" />
              {/* Eyes */}
              <circle cx="31" cy="13" r="1" fill="hsl(var(--foreground) / 0.5)" />
              <circle cx="37" cy="13" r="1" fill="hsl(var(--foreground) / 0.5)" />
              {/* Ears */}
              <ellipse cx="28" cy="4" rx="3" ry="7" fill="hsl(var(--primary) / 0.3)" />
              <ellipse cx="28" cy="4" rx="1.5" ry="5" fill="hsl(var(--secondary) / 0.4)" />
              <ellipse cx="40" cy="4" rx="3" ry="7" fill="hsl(var(--primary) / 0.3)" />
              <ellipse cx="40" cy="4" rx="1.5" ry="5" fill="hsl(var(--secondary) / 0.4)" />
            </motion.g>
          </svg>
        </motion.div>

        <h3 className="text-xl font-medium text-foreground mb-3 tracking-tight">{title}</h3>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">{description}</p>

        {(actionLabel && (actionLink || onAction)) && (
          <Button
            asChild={!!actionLink}
            onClick={onAction}
            size="lg"
            className="rounded-full px-8 h-12 shadow-lg shadow-primary/20"
          >
            {actionLink ? <Link to={actionLink}>{actionLabel}</Link> : actionLabel}
          </Button>
        )}
      </GlassCard>
    );
  }

  // Bamboo: scholarly illustration
  if (skin === "bamboo") {
    return (
      <GlassCard className={`text-center py-16 animate-slide-up ${className || ""}`}>
        <motion.div
          className="mx-auto mb-6 relative w-24 h-24 flex items-center justify-center"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="80" height="80" viewBox="0 0 80 80" className="drop-shadow-sm">
            {/* Inverted bamboo jar */}
            <rect x="20" y="16" width="28" height="52" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1.5" transform="rotate(180 34 42)" />
            {/* Bamboo nodes */}
            <line x1="20" y1="32" x2="48" y2="32" stroke="hsl(var(--primary) / 0.15)" strokeWidth="1" />
            <line x1="20" y1="52" x2="48" y2="52" stroke="hsl(var(--primary) / 0.15)" strokeWidth="1" />

            {/* Panda peeking beside jar */}
            <motion.g
              animate={{ rotate: [0, 5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "60px 55px" }}
            >
              {/* Panda head */}
              <circle cx="60" cy="50" r="10" fill="hsl(var(--background))" stroke="hsl(var(--foreground) / 0.2)" strokeWidth="1" />
              {/* Eyes (dark patches) */}
              <ellipse cx="56" cy="49" rx="3" ry="3.5" fill="hsl(var(--foreground) / 0.15)" />
              <ellipse cx="64" cy="49" rx="3" ry="3.5" fill="hsl(var(--foreground) / 0.15)" />
              {/* Pupils */}
              <circle cx="56" cy="49" r="1.2" fill="hsl(var(--foreground) / 0.6)" />
              <circle cx="64" cy="49" r="1.2" fill="hsl(var(--foreground) / 0.6)" />
              {/* Ears */}
              <circle cx="52" cy="42" r="4" fill="hsl(var(--foreground) / 0.2)" />
              <circle cx="68" cy="42" r="4" fill="hsl(var(--foreground) / 0.2)" />
              {/* Glasses */}
              <circle cx="56" cy="49" r="4.5" fill="none" stroke="hsl(var(--accent))" strokeWidth="0.8" />
              <circle cx="64" cy="49" r="4.5" fill="none" stroke="hsl(var(--accent))" strokeWidth="0.8" />
              <line x1="60.5" y1="49" x2="59.5" y2="49" stroke="hsl(var(--accent))" strokeWidth="0.6" />
            </motion.g>

            {/* Squirrel in background */}
            <motion.text
              x="8" y="72"
              fontSize="12"
              animate={{ x: [8, 12, 8] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              🐿️
            </motion.text>
          </svg>
        </motion.div>

        <h3 className="text-xl font-medium text-foreground mb-3 tracking-tight">{title}</h3>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">{description}</p>

        {(actionLabel && (actionLink || onAction)) && (
          <Button
            asChild={!!actionLink}
            onClick={onAction}
            size="lg"
            className="px-8 h-12 shadow-lg shadow-primary/20"
          >
            {actionLink ? <Link to={actionLink}>{actionLabel}</Link> : actionLabel}
          </Button>
        )}
      </GlassCard>
    );
  }

  // Default (ghibli / street / drift) — original EmptyState
  return (
    <GlassCard className={`text-center py-16 animate-slide-up bg-opacity-60 border-white/20 ${className || ""}`}>
      <motion.div
        className="w-20 h-20 rounded-[30%_70%_70%_30%/60%_40%_60%_40%] bg-primary/10 flex items-center justify-center mx-auto mb-6 relative overflow-hidden"
        animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent opacity-50" />
        <Icon className="w-10 h-10 text-primary relative z-10" />
      </motion.div>

      <h3 className="text-2xl font-bold text-foreground mb-3 tracking-tight">{title}</h3>
      <p className="text-muted-foreground mb-8 max-w-sm mx-auto text-lg leading-relaxed">{description}</p>

      {(actionLabel && (actionLink || onAction)) && (
        <Button
          asChild={!!actionLink}
          onClick={onAction}
          size="lg"
          className="rounded-full px-8 h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300"
        >
          {actionLink ? <Link to={actionLink}>{actionLabel}</Link> : actionLabel}
        </Button>
      )}
    </GlassCard>
  );
};

export default SkinEmptyState;
