import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageBackgroundProps {
  children: ReactNode;
  className?: string;
  showClouds?: boolean;
}

export const PageBackground = ({ 
  children, 
  className,
  showClouds = true 
}: PageBackgroundProps) => {
  return (
    <div className={cn("min-h-screen relative overflow-hidden", className)}>
      {/* 宫崎骏风格渐变背景 */}
      <div className="fixed inset-0 ghibli-gradient -z-10" />
      
      {/* 装饰性云朵 */}
      {showClouds && (
        <>
          <div 
            className="cloud-decoration w-32 h-16 top-20 left-[10%] opacity-60"
            style={{ animationDelay: "0s" }}
          />
          <div 
            className="cloud-decoration w-48 h-20 top-32 right-[15%] opacity-50"
            style={{ animationDelay: "2s" }}
          />
          <div 
            className="cloud-decoration w-24 h-12 top-48 left-[25%] opacity-40"
            style={{ animationDelay: "4s" }}
          />
          <div 
            className="cloud-decoration w-40 h-16 bottom-32 right-[20%] opacity-30"
            style={{ animationDelay: "1s" }}
          />
          <div 
            className="cloud-decoration w-20 h-10 bottom-48 left-[5%] opacity-50"
            style={{ animationDelay: "3s" }}
          />
        </>
      )}
      
      {/* 底部渐变 - 模拟地面 */}
      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-ghibli-forest/10 to-transparent -z-10" />
      
      {/* 内容 */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default PageBackground;
