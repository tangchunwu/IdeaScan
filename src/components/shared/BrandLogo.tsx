import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon";
  theme?: "light" | "dark" | "color";
}

export const BrandLogo = ({ 
  className, 
  size = "md", 
  variant = "full",
  theme = "color"
}: BrandLogoProps) => {
  const sizeClasses = {
    sm: "h-6 text-lg",
    md: "h-8 text-xl",
    lg: "h-10 text-2xl",
    xl: "h-14 text-4xl"
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-7 h-7",
    xl: "w-10 h-10"
  };

  return (
    <div className={cn("flex items-center gap-2 font-bold tracking-tight select-none", sizeClasses[size], className)}>
      <div className={cn(
        "relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg overflow-hidden transition-all duration-300",
        size === "xl" ? "w-14 h-14" : size === "lg" ? "w-10 h-10" : size === "md" ? "w-8 h-8" : "w-6 h-6",
        "group hover:shadow-primary/25 hover:scale-105"
      )}>
        {/* Glass shine effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent opacity-50" />
        
        {/* Icon */}
        <Sparkles className={cn("text-white relative z-10 transition-transform duration-500 group-hover:rotate-12", iconSizes[size])} strokeWidth={2.5} />
        
        {/* Background blobs */}
        <div className="absolute -bottom-2 -right-2 w-full h-full bg-accent text-accent mix-blend-overlay opacity-40 blur-sm rounded-full" />
      </div>

      {variant === "full" && (
        <span className={cn(
          "bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-gradient",
          theme === "light" ? "text-white" : ""
        )}>
          IdeaValidator
        </span>
      )}
    </div>
  );
};
