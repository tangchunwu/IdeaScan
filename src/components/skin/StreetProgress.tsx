import { cn } from "@/lib/utils";

interface StreetProgressProps {
  value: number;
  className?: string;
}

/**
 * Street 皮肤进度条 — 锐角 + 橘色条 + 无圆角
 */
export const StreetProgress = ({ value, className }: StreetProgressProps) => {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden bg-muted/50", className)} style={{ borderRadius: "1px" }}>
      <div
        className="h-full transition-all duration-300 ease-out"
        style={{
          width: `${value}%`,
          background: "hsl(var(--primary))",
          borderRadius: "0",
        }}
      />
    </div>
  );
};
