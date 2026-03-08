import { TrendingUp, AlertCircle, Target } from "lucide-react";
import { GlassCard } from "@/components/shared";
import ReactMarkdown from "react-markdown";
import type { ReportDataResult } from "./useReportData";
import { RiskMitigationCards } from "./RiskMitigationCards";
import { MonetizationStrategies } from "./MonetizationStrategies";
import { BrandNameSuggestions } from "./BrandNameSuggestions";

interface AIAnalysisTabProps {
  data: ReportDataResult;
  aiAnalysis: any;
}

export function AIAnalysisTab({ data, aiAnalysis }: AIAnalysisTabProps) {
  const { aiAnalysis: ai } = data;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* 1. Thesis & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <GlassCard className="h-full overflow-hidden" padding="none">
          <div className="h-1 bg-gradient-to-r from-green-500/40 to-transparent" />
          <div className="p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-green-500">核心投资亮点</span>
            </h3>
            <ul className="space-y-3">
              {ai.strengths?.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                  <div className="text-foreground/90 prose prose-invert max-w-none">
                    <ReactMarkdown>{item}</ReactMarkdown>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>

        <GlassCard className="h-full overflow-hidden" padding="none">
          <div className="h-1 bg-gradient-to-r from-red-500/40 to-transparent" />
          <div className="p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-red-500">关键风险与致命伤</span>
            </h3>
            <ul className="space-y-3">
              {ai.weaknesses?.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <div className="text-foreground/90 prose prose-invert max-w-none">
                    <ReactMarkdown>{item}</ReactMarkdown>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
      </div>

      {/* 2. Strategic Roadmap — Timeline style */}
      <GlassCard>
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-primary">
          <Target className="w-5 h-5" />
          战略路线图
        </h3>
        <div className="relative pl-6">
          {/* Timeline connector line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />
          <div className="space-y-4">
            {ai.suggestions?.map((item: any, i: number) => (
              <div key={i} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="absolute -left-6 top-3 w-[11px] h-[11px] rounded-full border-2 border-primary bg-background z-10" />
                <div className="flex-1 p-4 rounded-lg bg-card/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-primary/70 uppercase tracking-wider">Step {i + 1}</span>
                  </div>
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
                        <p className="text-xs text-primary/80 flex items-center gap-1 mt-1">
                          <span className="opacity-60">📚 参考:</span> {item.reference}
                        </p>
                      )}
                      {item.expectedResult && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="opacity-60">→ 预期效果:</span> {item.expectedResult}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* 3. Risk Mitigation */}
      <RiskMitigationCards risks={aiAnalysis.risks} />

      {/* 4. Monetization Strategies */}
      <MonetizationStrategies strategies={aiAnalysis.monetizationStrategies} />

      {/* 5. Brand Name Suggestions */}
      <BrandNameSuggestions brandNames={aiAnalysis.brandNames} />
    </div>
  );
}
