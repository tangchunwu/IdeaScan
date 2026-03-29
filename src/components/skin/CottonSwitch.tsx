import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CottonSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** 棉棉兔耳开关 — 滑块是兔子头像，耳朵竖立/耷拉 */
export const CottonSwitch = ({ checked, onCheckedChange, disabled, className }: CottonSwitchProps) => {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-45 cursor-not-allowed",
        className
      )}
    >
      {/* Track decorations */}
      <motion.span
        className="absolute text-[8px] pointer-events-none"
        animate={{ opacity: checked ? 0 : 0.5, x: checked ? -4 : 0 }}
        style={{ right: 6, top: "50%", transform: "translateY(-50%)" }}
      >
        🌙
      </motion.span>
      <motion.span
        className="absolute text-[8px] pointer-events-none"
        animate={{ opacity: checked ? 0.6 : 0, x: checked ? 0 : 4 }}
        style={{ left: 6, top: "50%", transform: "translateY(-50%)" }}
      >
        ✦
      </motion.span>

      {/* Rabbit head slider */}
      <motion.div
        className="relative flex items-center justify-center w-6 h-6 rounded-full bg-background shadow-md"
        animate={{
          x: checked ? 22 : 2,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 18,
        }}
      >
        {/* Rabbit ears */}
        <svg width="20" height="20" viewBox="-10 -14 20 20" className="absolute -top-2">
          {/* Left ear */}
          <motion.ellipse
            cx="-4" rx="2.5" ry="6"
            fill="hsl(var(--primary))"
            stroke="hsl(var(--primary) / 0.5)"
            strokeWidth="0.5"
            animate={{
              cy: checked ? -8 : -4,
              ry: checked ? 6 : 4,
              rotate: checked ? -5 : -25,
            }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          />
          {/* Left ear inner */}
          <motion.ellipse
            cx="-4" rx="1.2" ry="4"
            fill="hsl(var(--secondary))"
            animate={{
              cy: checked ? -8 : -4,
              ry: checked ? 4 : 2.5,
              rotate: checked ? -5 : -25,
            }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          />
          {/* Right ear */}
          <motion.ellipse
            cx="4" rx="2.5" ry="6"
            fill="hsl(var(--primary))"
            stroke="hsl(var(--primary) / 0.5)"
            strokeWidth="0.5"
            animate={{
              cy: checked ? -8 : -4,
              ry: checked ? 6 : 4,
              rotate: checked ? 5 : 25,
            }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          />
          {/* Right ear inner */}
          <motion.ellipse
            cx="4" rx="1.2" ry="4"
            fill="hsl(var(--secondary))"
            animate={{
              cy: checked ? -8 : -4,
              ry: checked ? 4 : 2.5,
              rotate: checked ? 5 : 25,
            }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </svg>

        {/* Face */}
        <div className="w-2 h-2 flex items-center justify-center">
          <div className="flex gap-[2px]">
            <div className="w-[2px] h-[2px] rounded-full bg-foreground/60" />
            <div className="w-[2px] h-[2px] rounded-full bg-foreground/60" />
          </div>
        </div>
      </motion.div>
    </button>
  );
};
