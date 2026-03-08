import { useState } from "react";
import { GlassCard } from "@/components/shared";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Tooltip,
} from "recharts";
import { Target, Activity, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { CustomTooltip } from "./CustomTooltip";
import ReactMarkdown from "react-markdown";

interface RadarDimensionSectionProps {
  radarData: Array<{ subject: string; A: number; fullMark: number }>;
  dimensions: Array<{ dimension: string; score: number; reason?: string }>;
}

const DimensionItem = ({ d, i }: { d: { dimension: string; score: number; reason?: string }; i: number }) => {
  const [expanded, setExpanded] = useState(false);
  const isLow = d.score < 50;
  const isHigh = d.score >= 80;

  return (
    <div
      key={i}
      className="space-y-2 group cursor-pointer rounded-xl p-3 -m-3 hover:bg-muted/30 transition-colors"
      onClick={() => d.reason && setExpanded(!expanded)}
    >
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors flex items-center gap-1.5">
          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
          {isHigh && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
          {d.dimension}
          {isLow && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold">重点关注</span>}
          {isHigh && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-semibold">表现优秀</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${d.score >= 80 ? 'text-green-500' : d.score >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>{d.score}</span>
          {d.reason && (
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>
      <Progress value={d.score} className="h-2" indicatorClassName={d.score >= 80 ? 'bg-green-500' : d.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'} />
      {d.reason && (
        <div
          className={`text-xs text-muted-foreground/80 leading-relaxed pl-2 border-l-2 border-border mt-1.5 prose prose-invert max-w-none overflow-hidden transition-all duration-300 ${
            expanded ? 'max-h-[500px] opacity-100' : 'max-h-[2.8em] opacity-70'
          }`}
        >
          <ReactMarkdown>{d.reason}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export const RadarDimensionSection = ({ radarData, dimensions }: RadarDimensionSectionProps) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
    <GlassCard className="lg:col-span-1 animate-slide-up h-full flex flex-col" style={{ animationDelay: "200ms" }} padding="md">
      <h3 className="font-semibold mb-2 flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" />需求验证雷达
      </h3>
      <div className="flex-1 min-h-[250px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <PolarGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" strokeWidth={3} fill="hsl(var(--primary))" fillOpacity={0.2} />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>

    <GlassCard className="lg:col-span-2 animate-slide-up" style={{ animationDelay: "300ms" }} padding="md">
      <h3 className="font-semibold mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-secondary" />需求真伪分析
        <span className="text-xs text-muted-foreground font-normal ml-auto">点击展开详情</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {dimensions.map((d, i) => (
          <DimensionItem key={i} d={d} i={i} />
        ))}
      </div>
    </GlassCard>
  </div>
);
