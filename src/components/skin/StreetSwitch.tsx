import { cn } from "@/lib/utils";

interface StreetSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Street 皮肤开关 — 方角最小化开关，无弹跳
 */
export const StreetSwitch = ({ checked, onCheckedChange, disabled, className }: StreetSwitchProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center transition-colors duration-120",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={{ borderRadius: "2px" }}
    >
      <span
        className="block h-3.5 w-3.5 bg-foreground transition-transform duration-120"
        style={{
          borderRadius: "1px",
          transform: checked ? "translateX(16px)" : "translateX(2px)",
        }}
      />
    </button>
  );
};
