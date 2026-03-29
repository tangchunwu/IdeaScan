import { ReactNode, useMemo, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

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

export const PageBackground = forwardRef<HTMLDivElement, PageBackgroundProps>(({
  children,
  className,
  showClouds = true,
  variant = "default",
  short = false,
}, ref) => {
  const clouds = useMemo(() => generateClouds(6), []);
  const { skin } = useTheme();

  // Street skin: pure dark bg with orange glow
  if (skin === "street") {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}
      >
        <div className="fixed inset-0 -z-10 bg-background" />
        {/* Orange street lamp glow */}
        <div className="fixed top-0 left-1/3 w-80 h-80 rounded-full blur-[120px] -z-10"
          style={{ background: "hsl(22 78% 60% / 0.08)" }} />
        <div className="fixed top-40 right-1/4 w-48 h-48 rounded-full blur-[80px] -z-10"
          style={{ background: "hsl(43 90% 61% / 0.04)" }} />
        <div className="relative z-10 page-enter">{children}</div>
      </div>
    );
  }

  // Cotton skin: soft lavender warmth
  if (skin === "cotton") {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}
      >
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background via-background to-secondary/8" />
        {/* Lavender glow */}
        <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full blur-[100px] -z-10"
          style={{ background: "hsl(310 35% 80% / 0.12)" }} />
        <div className="fixed top-32 right-1/3 w-64 h-64 rounded-full blur-[80px] -z-10"
          style={{ background: "hsl(350 50% 85% / 0.1)" }} />
        <div className="fixed bottom-20 left-1/3 w-48 h-48 rounded-full blur-[60px] -z-10"
          style={{ background: "hsl(26 40% 60% / 0.06)" }} />
        {/* Soft floating cotton puffs */}
        {showClouds && (
          <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
            {clouds.slice(0, 4).map((cloud) => (
              <div
                key={cloud.id}
                className="absolute rounded-full blur-sm"
                style={{
                  width: cloud.width * 1.2,
                  height: cloud.height * 1.2,
                  top: cloud.top,
                  left: cloud.left,
                  opacity: cloud.opacity * 0.5,
                  background: "hsl(310 35% 80% / 0.1)",
                  animation: `float ${Number(cloud.duration.replace('s', '')) * 1.3}s cubic-bezier(0.34, 1.56, 0.64, 1) ${cloud.delay} infinite`,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative z-10 page-enter">{children}</div>
      </div>
    );
  }

  // Bamboo skin: bamboo paper warmth with green accents
  if (skin === "bamboo") {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}
      >
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background via-background to-primary/5" />
        {/* Bamboo green glow */}
        <div className="fixed top-0 right-1/4 w-80 h-80 rounded-full blur-[100px] -z-10"
          style={{ background: "hsl(145 28% 39% / 0.08)" }} />
        <div className="fixed bottom-32 left-1/4 w-64 h-64 rounded-full blur-[80px] -z-10"
          style={{ background: "hsl(40 75% 60% / 0.06)" }} />
        {/* Subtle bamboo leaf shapes */}
        {showClouds && (
          <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
            {clouds.slice(0, 3).map((cloud) => (
              <div
                key={cloud.id}
                className="absolute blur-sm"
                style={{
                  width: cloud.width * 0.5,
                  height: cloud.height * 1.5,
                  borderRadius: "40% 60% 60% 40% / 70% 30% 70% 30%",
                  top: cloud.top,
                  left: cloud.left,
                  opacity: cloud.opacity * 0.35,
                  background: "hsl(145 28% 39% / 0.1)",
                  animation: `float ${cloud.duration} ease-out ${cloud.delay} infinite`,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative z-10 page-enter">{children}</div>
      </div>
    );
  }

  // Drift skin: river mist with floating elements
  if (skin === "drift") {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}
      >
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background via-background to-primary/5" />
        {/* River mist blobs */}
        <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full blur-3xl -z-10"
          style={{ background: "hsl(199 30% 51% / 0.12)" }} />
        <div className="fixed bottom-20 right-1/3 w-64 h-64 rounded-full blur-3xl -z-10"
          style={{ background: "hsl(140 25% 55% / 0.08)" }} />
        {/* Subtle floating lily pads */}
        {showClouds && (
          <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
            {clouds.slice(0, 3).map((cloud) => (
              <div
                key={cloud.id}
                className="absolute rounded-full blur-sm"
                style={{
                  width: cloud.width * 0.7,
                  height: cloud.height * 0.7,
                  top: cloud.top,
                  left: cloud.left,
                  opacity: cloud.opacity * 0.6,
                  background: "hsl(140 25% 55% / 0.15)",
                  animation: `float ${Number(cloud.duration.replace('s', '')) * 1.5}s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite`,
                  animationDelay: cloud.delay,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative z-10 page-enter">{children}</div>
      </div>
    );
  }

  // Default ghibli skin
  const gradientClass = {
    default: "ghibli-gradient",
    subtle: "bg-gradient-to-b from-background via-background to-muted/30",
    vibrant: "bg-gradient-to-br from-ghibli-sky/30 via-background to-ghibli-forest/20",
  }[variant];

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", short ? "min-h-[calc(100vh-80px)]" : "min-h-screen", className)}
    >
      <div className={cn("fixed inset-0 -z-10", gradientClass)} />

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

      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-ghibli-forest/10 to-transparent -z-10" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-ghibli-sky/20 rounded-full blur-3xl -z-10" />
      <div className="fixed top-20 right-1/4 w-64 h-64 bg-ghibli-sunset/10 rounded-full blur-3xl -z-10" />

      <div className="relative z-10 page-enter">{children}</div>
    </div>
  );
});

PageBackground.displayName = "PageBackground";

export default PageBackground;
