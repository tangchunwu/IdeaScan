import { cn } from "@/lib/utils";
import { ReactNode, CSSProperties } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  elevated?: boolean;
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  style?: CSSProperties;
  onClick?: () => void;
}

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const GlassCard = ({ 
  children, 
  className, 
  hover = false,
  glow = false,
  elevated = false,
  interactive = false,
  padding = "md",
  style,
  onClick,
}: GlassCardProps) => {
  return (
    <div
      className={cn(
        elevated ? "glass-card-elevated" : "glass-card",
        paddingMap[padding],
        "transition-all duration-300",
        hover && "hover:translate-y-[-4px] hover:shadow-xl cursor-pointer",
        glow && "ghibli-glow",
        interactive && "card-interactive",
        onClick && "cursor-pointer",
        className
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default GlassCard;
