import { TrendingUp, Swords, Rocket } from 'lucide-react';
import { researchDecisionLabel } from './useReportData';
interface QuickInsightsCardsProps {
  score: number | null;
  competitionLevel?: string;
  overallVerdict?: string;
  strengths?: string[];
  weaknesses?: string[];
  sentimentPositive: number | null;
  analysisStatus?: string;
  decision?: string;
}
export const QuickInsightsCards = ({ score, competitionLevel, analysisStatus, decision }: QuickInsightsCardsProps) => {
  const label = researchDecisionLabel(analysisStatus, decision);
  return <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
    {[
      { Icon: TrendingUp, title: '研究判断', value: label, detail: '依据支持、反证和待核实项判断下一步' },
      { Icon: Swords, title: '竞争情况', value: competitionLevel || '竞争情况尚未确认', detail: '竞品存在或数量不能直接说明机会好坏' },
      { Icon: Rocket, title: '研究参考分', value: score !== null && analysisStatus !== 'incomplete' ? `${score}/100` : '尚未评分', detail: '参考分用于研究排序，不能证明真实付款' },
    ].map(({ Icon, title, value, detail }) => <div key={title} className="rounded-2xl border border-border/40 bg-card/70 p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">{title}</span></div><p className="mb-2 text-xl font-semibold">{value}</p><p className="text-xs leading-relaxed text-muted-foreground">{detail}</p></div>)}
  </div>;
};
