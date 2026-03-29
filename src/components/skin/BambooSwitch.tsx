import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BambooSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** 竹竹竹扣开关 — 竹纹底座 + 旋转拨片 */
export const BambooSwitch = ({ checked, onCheckedChange, disabled, className }: BambooSwitchProps) => {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-lg transition-colors duration-280 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      style={{
        backgroundImage: checked
          ? undefined
          : "repeating-linear-gradient(90deg, transparent, transparent 3px, hsl(var(--primary) / 0.04) 3px, hsl(var(--primary) / 0.04) 4px)",
      }}
    >
      {/* Label micro tags */}
      <motion.span
        className="absolute text-[7px] text-primary-foreground/60 pointer-events-none font-medium"
        style={{ left: 4, top: "50%", transform: "translateY(-50%)" }}
        animate={{ opacity: checked ? 0.7 : 0 }}
      >
        ✓
      </motion.span>
      <motion.span
        className="absolute text-[7px] text-muted-foreground/50 pointer-events-none"
        style={{ right: 4, top: "50%", transform: "translateY(-50%)" }}
        animate={{ opacity: checked ? 0 : 0.6 }}
      >
        ○
      </motion.span>

      {/* Knob — bamboo clasp style */}
      <motion.div
        className={cn(
          "relative flex items-center justify-center w-6 h-6 rounded-md shadow-md border",
          checked ? "bg-background border-primary/30" : "bg-background border-border"
        )}
        animate={{
          x: checked ? 22 : 2,
          rotate: checked ? 0 : -15,
        }}
        transition={{
          x: { duration: 0.28, ease: "easeOut" },
          rotate: { duration: 0.28, ease: "easeOut" },
        }}
      >
        {/* Bamboo grain on knob */}
        <div className="absolute inset-0.5 rounded-sm overflow-hidden opacity-20">
          <div className="w-full h-full" style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--primary) / 0.3) 2px, hsl(var(--primary) / 0.3) 3px)",
          }} />
        </div>

        {/* Glasses icon (simplified) */}
        <svg width="14" height="8" viewBox="0 0 14 8" className="relative z-10">
          <circle cx="4" cy="4" r="3" fill="none" stroke={checked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth="1" />
          <circle cx="10" cy="4" r="3" fill="none" stroke={checked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth="1" />
          <line x1="7" y1="4" x2="7" y2="4" stroke={checked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth="0.8" />
          {/* Bridge */}
          <path d="M7 4 Q7 3 7 4" stroke={checked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth="0.8" fill="none" />
        </svg>
      </motion.div>
    </button>
  );
};
