import { cn } from "@/lib/utils";

interface DriftProgressProps {
  value: number;
  className?: string;
}

/**
 * Drift 皮肤进度条 — 流动水波条
 */
export const DriftProgress = ({ value, className }: DriftProgressProps) => {
  return (
    <div className={cn("relative h-4 w-full overflow-hidden rounded-full bg-muted/30", className)}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
        style={{
          width: `${value}%`,
          background: "linear-gradient(90deg, hsl(var(--primary) / 0.6), hsl(var(--secondary) / 0.6), hsl(var(--primary) / 0.6))",
          backgroundSize: "200% 100%",
          animation: "drift-wave 3s ease-in-out infinite",
        }}
      >
        {/* Water ripple overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "repeating-linear-gradient(90deg, transparent, transparent 8px, hsl(0 0% 100% / 0.15) 8px, hsl(0 0% 100% / 0.15) 10px)",
            animation: "drift-ripple 2s linear infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes drift-wave {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes drift-ripple {
          0% { transform: translateX(-20px); }
          100% { transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
};
