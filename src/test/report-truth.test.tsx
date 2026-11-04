import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveReportData } from '@/components/report/useReportData';
import { DemandDecisionCard } from '@/components/report/DemandDecisionCard';
import { ScoreHeroCard } from '@/components/report/ScoreHeroCard';
import { DataConfidenceCard } from '@/components/report/DataConfidenceCard';
import { DataOverviewTab } from '@/components/report/DataOverviewTab';
import { MarketInsightsTab } from '@/components/report/MarketInsightsTab';
import { RadarDimensionSection } from '@/components/report/RadarDimensionSection';

vi.mock('@/components/shared', () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScoreCircle: () => <span data-testid="score-circle" />,
}));
vi.mock('@/hooks/useSkinToast', () => ({ useSkinToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

afterEach(cleanup);
const read = (report: Record<string, unknown> = {}, overallScore: number | null = null) => deriveReportData({
  validation: { id: 'v1', idea: '小应用', tags: [], overall_score: overallScore, status: 'completed' }, report,
} as never)!;

describe('报告如实展示证据边界', () => {
  it('缺失报告字段保持未知，不补造趋势、情感、维度或市场规模', () => {
    const data = read();
    expect(data.xiaohongshuData.weeklyTrend).toEqual([]);
    expect(data.xiaohongshuData.contentTypes).toEqual([]);
    expect(data.dimensions).toEqual([]);
    expect(data.radarData).toEqual([]);
    expect(data.sentimentAnalysis.positive).toBeNull();
    expect(data.aiAnalysis.feasibilityScore).toBeNull();
    expect(data.marketAnalysis.marketSize).toBe('尚未取得市场规模证据');
    expect(data.evidenceSummary).not.toMatch(/33%|中等规模|真实用户反馈/);
  });

  it('保留真实的 0%，并仅统计采集到的帖子而非上游估算总量', () => {
    const data = read({
      sentiment_analysis: { positive: 0, neutral: 100, negative: 0 },
      xiaohongshu_data: { totalNotes: 2000, sampleNotes: [{ note_id: '1', _platform: 'reddit' }, { note_id: '1', _platform: 'reddit' }], sampleComments: [] },
    });
    expect(data.sentimentAnalysis.positive).toBe(0);
    expect(data.xiaohongshuData.totalNotes).toBe(1);
    expect(data.platforms).toEqual([{ name: 'Reddit', count: 1 }]);
  });

  it('失败或旧报告的高分不能转成真实需求判断', () => {
    const data = read({ ai_analysis: { feasibilityScore: 98, analysisStatus: 'incomplete' }, sentiment_analysis: { positive: 80, neutral: 10, negative: 10 }, dimensions: [{ dimension: '需求痛感', score: 98 }] }, 98);
    expect(data.sentimentAnalysis.positive).toBeNull();
    expect(data.dimensions).toEqual([]);
    render(<DemandDecisionCard {...data} score={98} platforms={[]} />);
    expect(screen.getByText('分析未完成')).toBeInTheDocument();
    expect(screen.queryByText(/真实需求|强烈刚需|伪需求警告/)).not.toBeInTheDocument();
    expect(screen.queryByText(/付费意图 0%/)).not.toBeInTheDocument();
    cleanup();
    render(<ScoreHeroCard score={98} totalNotes={200} idea="旧报告" />);
    expect(screen.getByText('旧版研究判断')).toBeInTheDocument();
    expect(screen.queryByText(/真实刚需|疑似伪需求/)).not.toBeInTheDocument();
  });

  it('证据卡展示支持、反证、未知和可打开的引句', () => {
    const data = read({
      ai_analysis: { analysisStatus: 'complete', decision: 'test', evidenceAssessment: {
        support: [{ claim: '有人每周手工对账', evidenceIds: ['e1'] }],
        counter: [{ claim: '免费表格也能解决', evidenceIds: ['e2'] }],
        unknowns: ['实际购买意愿未知'], nextExperiment: '向五名目标用户报价',
      } },
      data_summary: { validationEvidence: [
        { id: 'e1', title: '对账经历', snippet: '我每周花两小时手工对账', url: 'https://www.reddit.com/r/test/comments/abc' },
        { id: 'e2', title: '免费替代', snippet: '我用免费表格就够了', url: 'https://example.com/review' },
      ] },
    });
    render(<DemandDecisionCard {...data} score={null} />);
    expect(screen.getByText('值得小测')).toBeInTheDocument();
    expect(screen.getByText('有人每周手工对账')).toBeInTheDocument();
    expect(screen.getByText('免费表格也能解决')).toBeInTheDocument();
    expect(screen.getByText('实际购买意愿未知')).toBeInTheDocument();
    expect(screen.getByText('向五名目标用户报价')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /对账经历/ })).toHaveAttribute('href', 'https://www.reddit.com/r/test/comments/abc');
  });

  it('样本量多也不宣称统计置信度，不默认最近七天', () => {
    render(<DataConfidenceCard sampleSize={500} platforms={[{ name: 'Reddit', count: 500 }, { name: '空平台', count: 0 }]} />);
    expect(screen.queryByText(/高可信度|综合置信度|最近7天|结论可信度高/)).not.toBeInTheDocument();
    expect(screen.getByText('时间范围未知')).toBeInTheDocument();
    expect(screen.queryByText('空平台')).not.toBeInTheDocument();
  });

  it('缺数据的报告分区不展示空趋势或情感统计图', () => {
    const data = read();
    render(<><DataOverviewTab data={data} /><MarketInsightsTab data={data} /><RadarDimensionSection radarData={data.radarData} dimensions={data.dimensions} /></>);
    expect(screen.getByText('暂无可核实的时间序列，未绘制趋势图。')).toBeInTheDocument();
    expect(screen.getByText('尚未取得情感分类数据')).toBeInTheDocument();
    expect(screen.getByText('尚未取得维度评分，未绘制雷达图。')).toBeInTheDocument();
    expect(document.querySelector('.recharts-wrapper')).toBeNull();
  });

  it('缺少评分时不把未知画成 0 分，已知 0 分可以保留', () => {
    render(<ScoreHeroCard score={null} analysisStatus="incomplete" totalNotes={0} />);
    expect(screen.getByText('尚未评分')).toBeInTheDocument();
    expect(screen.queryByTestId('score-circle')).not.toBeInTheDocument();
    cleanup();
    render(<ScoreHeroCard score={0} analysisStatus="complete" decision="insufficient" totalNotes={0} />);
    expect(screen.getByTestId('score-circle')).toBeInTheDocument();
    expect(screen.getByText('证据不足')).toBeInTheDocument();
  });

  it('不展示无效引用支持的主张，也不开放非 HTTPS 原帖链接', () => {
    const data = read({ ai_analysis: { analysisStatus: 'complete', decision: 'test', evidenceAssessment: { support: [{ claim: '不在证据池的断言', evidenceIds: ['missing'] }] } }, data_summary: { validationEvidence: [{ id: 'e1', title: '原文', snippet: '有效原文', url: 'javascript:alert(1)' }] } });
    expect(data.aiAnalysis.evidenceAssessment.support).toEqual([]);
    expect(data.aiAnalysis.decision).toBe('insufficient');
    expect(data.validationEvidence[0].url).toBeUndefined();
  });
});
