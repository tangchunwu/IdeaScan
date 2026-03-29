import { motion } from "framer-motion";

interface CottonProgressProps {
  value: number;
  className?: string;
}

/** 棉棉暖杯液位计 — 马克杯造型，奶茶从底部缓慢注入 */
export const CottonProgress = ({ value, className = "" }: CottonProgressProps) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const liquidHeight = (clampedValue / 100) * 52; // max liquid area height
  const pearlCount = Math.floor(clampedValue / 25);

  return (
    <div className={`relative inline-flex items-end gap-2 ${className}`}>
      <svg width="56" height="72" viewBox="0 0 56 72" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Mug body */}
        <rect x="6" y="10" width="36" height="56" rx="6" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.5" />

        {/* Liquid fill area (clipped) */}
        <defs>
          <clipPath id="cotton-cup-clip">
            <rect x="8" y="12" width="32" height="52" rx="4" />
          </clipPath>
        </defs>
        <g clipPath="url(#cotton-cup-clip)">
          {/* Liquid */}
          <motion.rect
            x="8"
            width="32"
            rx="2"
            fill="url(#cotton-liquid-grad)"
            initial={{ y: 64, height: 0 }}
            animate={{ y: 64 - liquidHeight, height: liquidHeight }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
          />
          {/* Liquid surface wobble */}
          <motion.ellipse
            cx="24"
            rx="14"
            ry="2.5"
            fill="hsl(45 40% 92% / 0.6)"
            animate={{ cy: 64 - liquidHeight, rx: [14, 15, 14] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Floating pearls */}
          {Array.from({ length: pearlCount }).map((_, i) => (
            <motion.circle
              key={i}
              cx={14 + i * 8}
              r="3"
              fill="hsl(var(--accent))"
              stroke="hsl(var(--accent) / 0.5)"
              strokeWidth="0.5"
              initial={{ cy: 60 }}
              animate={{
                cy: 64 - liquidHeight + 6,
                x: [0, i % 2 === 0 ? 2 : -2, 0],
              }}
              transition={{
                cy: { duration: 1.5, delay: 0.3 * i, ease: "easeOut" },
                x: { duration: 2, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          ))}
        </g>

        {/* Gradient definition */}
        <defs>
          <linearGradient id="cotton-liquid-grad" x1="24" y1="64" x2="24" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="hsl(26 40% 60%)" />
            <stop offset="100%" stopColor="hsl(45 40% 92%)" />
          </linearGradient>
        </defs>

        {/* Rabbit ear handle */}
        <path
          d="M42 28 C50 22 54 26 50 34 C48 38 44 38 42 36"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Inner ear pink */}
        <path
          d="M44 28 C49 24 52 27 49 33 C48 35 45 35 44 34"
          fill="hsl(var(--primary) / 0.2)"
          stroke="none"
        />

        {/* Steam wisps when complete */}
        {clampedValue >= 100 && (
          <>
            <motion.path
              d="M16 10 C14 4 18 2 16 -2"
              stroke="hsl(var(--muted-foreground) / 0.3)"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
              animate={{ opacity: [0.2, 0.5, 0.2], y: [0, -3, 0] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
            <motion.path
              d="M24 10 C22 4 26 2 24 -2"
              stroke="hsl(var(--muted-foreground) / 0.3)"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
              animate={{ opacity: [0.3, 0.6, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
            />
            <motion.path
              d="M32 10 C30 5 34 3 32 -1"
              stroke="hsl(var(--muted-foreground) / 0.3)"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
              animate={{ opacity: [0.2, 0.4, 0.2], y: [0, -3, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1 }}
            />
          </>
        )}

        {/* Rabbit ears peeking when complete */}
        {clampedValue >= 100 && (
          <motion.g
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ellipse cx="20" cy="6" rx="3" ry="7" fill="hsl(var(--primary))" />
            <ellipse cx="20" cy="6" rx="1.5" ry="5" fill="hsl(var(--secondary))" />
            <ellipse cx="28" cy="6" rx="3" ry="7" fill="hsl(var(--primary))" />
            <ellipse cx="28" cy="6" rx="1.5" ry="5" fill="hsl(var(--secondary))" />
          </motion.g>
        )}
      </svg>

      {/* Percentage label */}
      <span className="text-xs text-muted-foreground font-medium tabular-nums mb-1">
        {clampedValue}%
      </span>
    </div>
  );
};
