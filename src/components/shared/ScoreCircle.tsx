import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface ScoreCircleProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  showAnimation?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { container: "w-16 h-16", text: "text-lg", label: "text-xs", stroke: 6 },
  md: { container: "w-24 h-24", text: "text-2xl", label: "text-sm", stroke: 7 },
  lg: { container: "w-32 h-32", text: "text-4xl", label: "text-base", stroke: 8 },
  xl: { container: "w-40 h-40", text: "text-5xl", label: "text-lg", stroke: 9 },
};

const getScoreGradient = (percentage: number) => {
  if (percentage >= 80) return { start: "hsl(var(--secondary))", end: "hsl(var(--forest-green))" };
  if (percentage >= 60) return { start: "hsl(var(--primary))", end: "hsl(var(--sky-blue))" };
  if (percentage >= 40) return { start: "hsl(var(--accent))", end: "hsl(var(--sunset-orange))" };
  return { start: "hsl(var(--destructive))", end: "hsl(345, 60%, 50%)" };
};

const getScoreLabel = (percentage: number) => {
  if (percentage >= 80) return "优秀";
  if (percentage >= 60) return "良好";
  if (percentage >= 40) return "一般";
  return "待改进";
};

export const ScoreCircle = ({
  score,
  maxScore = 100,
  size = "md",
  label,
  showAnimation = true,
  className
}: ScoreCircleProps) => {
  const [animatedScore, setAnimatedScore] = useState(showAnimation ? 0 : score);
  const config = sizeConfig[size];
  const percentage = (animatedScore / maxScore) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const gradient = getScoreGradient((score / maxScore) * 100);
  const gradientId = `scoreGradient-${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    if (!showAnimation) return;

    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
        setTimeout(() => {
          const element = document.getElementById(`score-${gradientId}`);
          if (element) {
            element.classList.add("scale-110");
            setTimeout(() => element.classList.remove("scale-110"), 300);
          }
        }, 100);
      } else {
        setAnimatedScore(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score, showAnimation]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        id={`score-${gradientId}`}
        className={cn("relative transition-transform duration-300", config.container)}
      >
        {/* 外部光晕 */}
        <div
          className="absolute inset-0 rounded-full opacity-30 blur-md"
          style={{
            background: `radial-gradient(circle, ${gradient.start}, transparent)`
          }}
        />

        {/* SVG 圆环 */}
        <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
          {/* 背景圆环 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={config.stroke}
            className="opacity-50"
          />

          {/* 进度圆环 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out drop-shadow-sm"
          />

          {/* 渐变定义 */}
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradient.start} />
              <stop offset="100%" stopColor={gradient.end} />
            </linearGradient>
          </defs>
        </svg>

        {/* 分数文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold text-foreground number-highlight", config.text)}>
            {animatedScore}
          </span>
          {size !== "sm" && (
            <span className="text-xs text-muted-foreground">
              {getScoreLabel((score / maxScore) * 100)}
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className={cn("text-muted-foreground font-medium text-center", config.label)}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ScoreCircle;
