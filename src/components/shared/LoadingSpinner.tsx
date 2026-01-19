import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

export const LoadingSpinner = ({ 
  size = "md", 
  text,
  className 
}: LoadingSpinnerProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <Loader2 className={cn(sizeClasses[size], "animate-spin text-primary")} />
      {text && (
        <p className="text-muted-foreground text-sm animate-pulse-soft">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
