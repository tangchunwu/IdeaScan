import { ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

interface PageBackgroundProps {
  children: ReactNode;
  className?: string;
  showClouds?: boolean;
  variant?: "default" | "subtle" | "vibrant";
  short?: boolean;
}

// 生成随机但稳定的云朵配置
const generateClouds = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    width: 80 + (i * 37) % 80,
    height: 30 + (i * 23) % 40,
    top: `${10 + (i * 41) % 60}%`,
    left: `${5 + (i * 53) % 85}%`,
    opacity: 0.2 + (i * 0.1) % 0.4,
    delay: `${i * 1.5}s`,
    duration: `${6 + (i % 4)}s`,
  }));
};

export const PageBackground = ({
  children,
  className,
  showClouds = true,
  variant = "default",
  short = false
}: PageBackgroundProps) => {
  const clouds = useMemo(() => generateClouds(6), []);

  const gradientClass = {
    default: "ghibli-gradient",
    subtle: "bg-gradient-to-b from-background via-background to-muted/30",
    vibrant: "bg-gradient-to-br from-ghibli-sky/30 via-background to-ghibli-forest/20",
  }[variant];

  return (
    <div className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}>
      {/* 宫崎骏风格渐变背景 */}
      <div className={cn("fixed inset-0 -z-10", gradientClass)} />

      {/* 装饰性云朵 - 增加层次感 */}
      {showClouds && (
        <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
          {clouds.map((cloud) => (
            <div
              key={cloud.id}
              className="absolute rounded-full bg-ghibli-cloud/40 blur-sm"
              style={{
                width: cloud.width,
                height: cloud.height,
                top: cloud.top,
                left: cloud.left,
                opacity: cloud.opacity,
                animation: `float ${cloud.duration} ease-in-out infinite`,
                animationDelay: cloud.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* 底部渐变 - 模拟地面 */}
      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-ghibli-forest/10 to-transparent -z-10" />

      {/* 顶部柔和光晕 */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-ghibli-sky/20 rounded-full blur-3xl -z-10" />
      <div className="fixed top-20 right-1/4 w-64 h-64 bg-ghibli-sunset/10 rounded-full blur-3xl -z-10" />

      {/* 内容 */}
      <div className="relative z-10 page-enter">
        {children}
      </div>
    </div>
  );
};

export default PageBackground;
