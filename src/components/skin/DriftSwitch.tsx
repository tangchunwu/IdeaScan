import { cn } from "@/lib/utils";

interface DriftSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Drift 皮肤开关 — 缓漂式开关，慢动效
 */
export const DriftSwitch = ({ checked, onCheckedChange, disabled, className }: DriftSwitchProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary/60" : "bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={{ transitionDuration: "400ms", transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
    >
      <span
        className="block h-5 w-5 rounded-full bg-background shadow-md"
        style={{
          transform: checked ? "translateX(20px)" : "translateX(0px)",
          transition: "transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      />
    </button>
  );
};
