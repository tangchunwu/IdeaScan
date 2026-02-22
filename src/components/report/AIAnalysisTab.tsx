import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar,
} from "recharts";
import { Activity, TrendingUp, AlertCircle, AlertTriangle, Target } from "lucide-react";
import { GlassCard } from "@/components/shared";
import ReactMarkdown from "react-markdown";
import type { ReportDataResult } from "./useReportData";

interface AIAnalysisTabProps {
  data: ReportDataResult;
}

export function AIAnalysisTab({ data }: AIAnalysisTabProps) {
  const { radarData, dimensions, aiAnalysis } = data;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* 1. Radar Analysis */}
      <GlassCard className="p-8">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'currentColor', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              六维度深度评估
            </h3>
            <div className="space-y-3">
              {dimensions.map((d: any, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{d.dimension}</span>
                    <span className={`font-semibold ${d.score >= 80 ? 'text-green-500' : d.score < 50 ? 'text-red-500' : 'text-foreground'}`}>
                      {d.score}/100
                    </span>
                  </div>
                  {d.reason && (
                    <div className={`text-xs leading-relaxed pl-2 border-l-2 ${d.score < 50 ? 'border-red-500/50 text-red-400/80' : 'border-white/10 text-muted-foreground'} prose prose-invert max-w-none`}>
                      <ReactMarkdown>{d.reason}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 2. Thesis & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="h-full border-l-4 border-l-green-500 rounded-l-none">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-500">
            <TrendingUp className="w-5 h-5" />
            核心投资亮点
          </h3>
          <ul className="space-y-3">
            {aiAnalysis.strengths?.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div className="text-foreground/90 prose prose-invert max-w-none">
                  <ReactMarkdown>{item}</ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="h-full border-l-4 border-l-red-500 rounded-l-none">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-500">
            <AlertCircle className="w-5 h-5" />
            关键风险与致命伤
          </h3>
          <ul className="space-y-3">
            {aiAnalysis.weaknesses?.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <div className="text-foreground/90 prose prose-invert max-w-none">
                  <ReactMarkdown>{item}</ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {/* 3. Strategic Roadmap */}
      <GlassCard>
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
          <Target className="w-5 h-5" />
          战略路线图
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {aiAnalysis.suggestions?.map((item: any, i: number) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg bg-card/50 border border-white/5">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {i + 1}
              </div>
              <div className="flex-1 space-y-2">
                {typeof item === 'string' ? (
                  <div className="text-sm text-foreground leading-relaxed prose prose-invert max-w-none">
                    <ReactMarkdown>{item}</ReactMarkdown>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-foreground font-medium prose prose-invert max-w-none">
                      <ReactMarkdown>{item.action}</ReactMarkdown>
                    </div>
                    {item.reference && (
                      <p className="text-xs text-primary/80 flex items-center gap-1">
                        <span className="opacity-60">📚 参考:</span> {item.reference}
                      </p>
                    )}
                    {item.expectedResult && (
                      <p className="text-xs text-muted-foreground">
                        <span className="opacity-60">→ 预期效果:</span> {item.expectedResult}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 4. Pre-Mortem Analysis */}
      {aiAnalysis.risks && aiAnalysis.risks.length > 0 && (
        <GlassCard className="bg-red-500/5 border-red-500/10">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            失败前瞻分析
          </h3>
          <div className="space-y-2">
            {aiAnalysis.risks.map((item: string, i: number) => (
              <div key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-red-500/50 mt-1.5">•</span>
                <div className="prose prose-invert max-w-none text-sm text-muted-foreground">
                  <ReactMarkdown>{item}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
