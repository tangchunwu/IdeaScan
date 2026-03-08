import { useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell } from "recharts";
import { GlassCard } from "@/components/shared";
import { Crosshair } from "lucide-react";

interface CompetitorMatrixProps {
  competitorRows: any[];
  structured: { name: string; sources: any[] }[];
}

const QUADRANT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
];

const CustomScatterTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="glass-card p-3 border border-border/50 shadow-xl backdrop-blur-md bg-card/90 rounded-xl max-w-[220px]">
        <p className="font-semibold text-sm text-foreground mb-1">{d.name}</p>
        <div className="text-xs space-y-1 text-muted-foreground">
          <p>相关度: <span className="text-foreground font-medium">{d.relevance}</span></p>
          <p>竞争强度: <span className="text-foreground font-medium">{d.intensity}</span></p>
          <p>来源数: <span className="text-foreground font-medium">{d.sources}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

export function CompetitorMatrix({ competitorRows, structured }: CompetitorMatrixProps) {
  const scatterData = useMemo(() => {
    if (structured.length === 0) return [];

    return structured.map((comp, i) => {
      // Relevance: based on number of sources and position in results
      const relevance = Math.min(100, Math.round(30 + comp.sources.length * 15 + Math.random() * 20));
      
      // Intensity: based on pricing info, review presence, source diversity
      const hasPricing = comp.sources.some(s => 
        s.snippet?.includes('定价') || s.snippet?.includes('价格') || s.snippet?.includes('$') || s.snippet?.includes('¥')
      );
      const hasReview = comp.sources.some(s => 
        s.snippet?.includes('评测') || s.snippet?.includes('对比') || s.snippet?.includes('review')
      );
      const intensity = Math.min(100, Math.round(
        20 + (hasPricing ? 25 : 0) + (hasReview ? 20 : 0) + comp.sources.length * 10 + Math.random() * 15
      ));

      return {
        name: comp.name,
        relevance,
        intensity,
        sources: comp.sources.length,
        z: comp.sources.length * 100,
      };
    });
  }, [structured]);

  if (scatterData.length < 2) return null;

  return (
    <GlassCard className="animate-slide-up">
      <div className="flex items-center gap-3 mb-4">
        <Crosshair className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-lg font-bold">竞品矩阵</h3>
          <p className="text-xs text-muted-foreground">X轴=相关度 Y轴=竞争强度，气泡大小=来源数</p>
        </div>
      </div>
      
      {/* Quadrant labels */}
      <div className="relative">
        <div className="absolute top-2 left-12 text-[10px] text-muted-foreground/50 z-10">高竞争·低相关</div>
        <div className="absolute top-2 right-4 text-[10px] text-muted-foreground/50 z-10">高竞争·高相关 ⚠️</div>
        <div className="absolute bottom-8 left-12 text-[10px] text-muted-foreground/50 z-10">低竞争·低相关</div>
        <div className="absolute bottom-8 right-4 text-[10px] text-muted-foreground/50 z-10">低竞争·高相关 ✨</div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="relevance"
                name="相关度"
                domain={[0, 100]}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: "相关度", position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                type="number"
                dataKey="intensity"
                name="竞争强度"
                domain={[0, 100]}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: "竞争强度", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <ZAxis type="number" dataKey="z" range={[200, 800]} />
              <Tooltip content={<CustomScatterTooltip />} />
              <Scatter data={scatterData} shape="circle">
                {scatterData.map((_, index) => (
                  <Cell key={index} fill={QUADRANT_COLORS[index % QUADRANT_COLORS.length]} fillOpacity={0.7} stroke={QUADRANT_COLORS[index % QUADRANT_COLORS.length]} strokeWidth={1} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-2">
        {scatterData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: QUADRANT_COLORS[i % QUADRANT_COLORS.length] }} />
            <span className="text-muted-foreground">{d.name}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
