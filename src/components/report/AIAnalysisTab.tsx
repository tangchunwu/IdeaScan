import { TrendingUp, AlertCircle, Target } from "lucide-react";
import { GlassCard } from "@/components/shared";
import ReactMarkdown from "react-markdown";
import type { ReportDataResult } from "./useReportData";

interface AIAnalysisTabProps {
  data: ReportDataResult;
}

export function AIAnalysisTab({ data }: AIAnalysisTabProps) {
  const { aiAnalysis } = data;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* 1. Thesis & Risks */}
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

      {/* 2. Strategic Roadmap */}
      <GlassCard>
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
          <Target className="w-5 h-5" />
          战略路线图
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {aiAnalysis.suggestions?.map((item: any, i: number) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg bg-card/50 border border-border/30">
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
    </div>
  );
}
