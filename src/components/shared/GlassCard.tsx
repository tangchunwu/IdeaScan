import { cn } from "@/lib/utils";
import { ReactNode, CSSProperties } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  style?: CSSProperties;
}

export const GlassCard = ({ 
  children, 
  className, 
  hover = false,
  glow = false,
  style
}: GlassCardProps) => {
  return (
    <div
      className={cn(
        "glass-card p-6 transition-all duration-300",
        hover && "hover:translate-y-[-4px] hover:shadow-xl cursor-pointer",
        glow && "ghibli-glow",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
};

export default GlassCard;
