import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
  variant?: "default" | "dots" | "pulse";
}

const sizeConfig = {
  sm: { spinner: "w-5 h-5", text: "text-sm", container: "gap-2" },
  md: { spinner: "w-8 h-8", text: "text-base", container: "gap-3" },
  lg: { spinner: "w-12 h-12", text: "text-lg", container: "gap-4" },
};

export const LoadingSpinner = ({ 
  size = "md", 
  text,
  className,
  variant = "default"
}: LoadingSpinnerProps) => {
  const config = sizeConfig[size];

  if (variant === "dots") {
    return (
      <div className={cn("flex flex-col items-center", config.container, className)}>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "rounded-full bg-primary",
                size === "sm" ? "w-2 h-2" : size === "md" ? "w-2.5 h-2.5" : "w-3 h-3"
              )}
              style={{
                animation: "bounce-gentle 1.4s ease-in-out infinite",
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>
        {text && (
          <p className={cn("text-muted-foreground mt-3 animate-pulse-soft", config.text)}>
            {text}
          </p>
        )}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("flex flex-col items-center", config.container, className)}>
        <div className="relative">
          <div 
            className={cn(
              "rounded-full bg-primary/30",
              config.spinner
            )}
            style={{ animation: "pulse-glow 2s ease-in-out infinite" }}
          />
          <div 
            className={cn(
              "absolute inset-0 rounded-full bg-primary/50",
              config.spinner
            )}
            style={{ 
              animation: "pulse-glow 2s ease-in-out infinite",
              animationDelay: "0.5s" 
            }}
          />
        </div>
        {text && (
          <p className={cn("text-muted-foreground mt-3 animate-pulse-soft", config.text)}>
            {text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center", config.container, className)}>
      <div className="relative">
        {/* 外层光晕 */}
        <div 
          className={cn(
            "absolute inset-0 rounded-full bg-primary/20 blur-md",
            config.spinner
          )}
        />
        
        {/* 旋转图标 */}
        <Loader2 
          className={cn(
            "animate-spin text-primary relative z-10",
            config.spinner
          )} 
        />
      </div>
      
      {text && (
        <p className={cn("text-muted-foreground animate-pulse-soft", config.text)}>
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;
