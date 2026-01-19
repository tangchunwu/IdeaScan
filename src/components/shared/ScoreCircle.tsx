import { cn } from "@/lib/utils";

interface ScoreCircleProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const sizeConfig = {
  sm: { container: "w-16 h-16", text: "text-lg", label: "text-xs" },
  md: { container: "w-24 h-24", text: "text-2xl", label: "text-sm" },
  lg: { container: "w-32 h-32", text: "text-4xl", label: "text-base" },
};

const getScoreColor = (score: number, maxScore: number) => {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return "from-secondary to-ghibli-forest";
  if (percentage >= 60) return "from-primary to-ghibli-sky";
  if (percentage >= 40) return "from-accent to-ghibli-sunset";
  return "from-destructive to-red-400";
};

export const ScoreCircle = ({ 
  score, 
  maxScore = 100, 
  size = "md",
  label,
  className 
}: ScoreCircleProps) => {
  const config = sizeConfig[size];
  const percentage = (score / maxScore) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className={cn("relative", config.container)}>
        {/* 背景圆环 */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#scoreGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--secondary))" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* 分数文字 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold text-foreground", config.text)}>
            {score}
          </span>
        </div>
      </div>
      
      {label && (
        <span className={cn("text-muted-foreground font-medium", config.label)}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ScoreCircle;
