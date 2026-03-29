import { motion } from "framer-motion";

interface BambooProgressProps {
  value: number;
  className?: string;
}

/** 竹竹竹筒茶位计 — 竖立竹筒，液体从底部向上填充 */
export const BambooProgress = ({ value, className = "" }: BambooProgressProps) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const liquidHeight = (clampedValue / 100) * 56;
  const pearlCount = Math.floor(clampedValue / 25);

  return (
    <div className={`relative inline-flex items-end gap-2 ${className}`}>
      <svg width="40" height="80" viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bamboo tube body */}
        <rect x="8" y="8" width="24" height="64" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1.5" />

        {/* Bamboo node rings */}
        <line x1="8" y1="28" x2="32" y2="28" stroke="hsl(var(--primary) / 0.2)" strokeWidth="1" />
        <line x1="8" y1="48" x2="32" y2="48" stroke="hsl(var(--primary) / 0.2)" strokeWidth="1" />

        {/* Bamboo grain texture */}
        <line x1="14" y1="10" x2="14" y2="70" stroke="hsl(var(--primary) / 0.06)" strokeWidth="0.5" />
        <line x1="20" y1="10" x2="20" y2="70" stroke="hsl(var(--primary) / 0.06)" strokeWidth="0.5" />
        <line x1="26" y1="10" x2="26" y2="70" stroke="hsl(var(--primary) / 0.06)" strokeWidth="0.5" />

        {/* Liquid fill area */}
        <defs>
          <clipPath id="bamboo-tube-clip">
            <rect x="10" y="10" width="20" height="60" rx="2" />
          </clipPath>
          <linearGradient id="bamboo-liquid-grad" x1="20" y1="70" x2="20" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="hsl(30 35% 60%)" />
            <stop offset="100%" stopColor="hsl(145 28% 45%)" />
          </linearGradient>
        </defs>

        <g clipPath="url(#bamboo-tube-clip)">
          {/* Liquid */}
          <motion.rect
            x="10"
            width="20"
            rx="1"
            fill="url(#bamboo-liquid-grad)"
            initial={{ y: 70, height: 0 }}
            animate={{ y: 70 - liquidHeight, height: liquidHeight }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Bubbles */}
          {clampedValue > 0 && clampedValue < 100 && (
            <>
              <motion.circle
                cx="16" r="1.5"
                fill="hsl(var(--background) / 0.4)"
                animate={{ cy: [70 - liquidHeight + 10, 70 - liquidHeight + 2], opacity: [0.6, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0 }}
              />
              <motion.circle
                cx="24" r="1"
                fill="hsl(var(--background) / 0.3)"
                animate={{ cy: [70 - liquidHeight + 15, 70 - liquidHeight + 3], opacity: [0.5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 0.8 }}
              />
            </>
          )}

          {/* Pearls */}
          {Array.from({ length: pearlCount }).map((_, i) => (
            <motion.circle
              key={i}
              cx={15 + i * 4}
              r="2.5"
              fill="hsl(var(--accent))"
              stroke="hsl(var(--accent) / 0.4)"
              strokeWidth="0.5"
              initial={{ cy: 68 }}
              animate={{
                cy: 70 - liquidHeight + 5,
                x: [0, i % 2 === 0 ? 1 : -1, 0],
              }}
              transition={{
                cy: { duration: 1.2, delay: 0.2 * i, ease: "easeOut" },
                x: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          ))}
        </g>

        {/* Breathing glow when loading */}
        {clampedValue > 0 && clampedValue < 100 && (
          <motion.rect
            x="6" y="6" width="28" height="68" rx="6"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1"
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Complete: golden pearl overflow + glasses icon */}
        {clampedValue >= 100 && (
          <>
            <motion.circle
              cx="20" cy="6" r="4"
              fill="hsl(var(--accent))"
              stroke="hsl(var(--accent) / 0.6)"
              strokeWidth="1"
              initial={{ cy: 20, opacity: 0 }}
              animate={{ cy: 2, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            />
            {/* Glasses icon */}
            <motion.g
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.4, ease: "easeOut" }}
            >
              <circle cx="15" cy="-2" r="4" fill="none" stroke="hsl(var(--accent))" strokeWidth="1" />
              <circle cx="25" cy="-2" r="4" fill="none" stroke="hsl(var(--accent))" strokeWidth="1" />
              <line x1="19" y1="-2" x2="21" y2="-2" stroke="hsl(var(--accent))" strokeWidth="0.8" />
            </motion.g>
          </>
        )}
      </svg>

      <span className="text-xs text-muted-foreground font-medium tabular-nums mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {clampedValue}%
      </span>
    </div>
  );
};
