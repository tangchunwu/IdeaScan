import { describe, expect, it } from 'vitest';
import { generateReportHTML, type ReportData } from '@/lib/reportGenerator';
import { generatePDFHTML } from '@/lib/pdfGenerator';

const report = (overrides: Partial<ReportData> = {}): ReportData => ({
  id: 'v1', idea: '小应用研究', score: null, verdict: '尚需验证', tags: [], createdAt: '2026-11-04T00:00:00Z', dimensions: [], persona: null,
  marketAnalysis: { targetAudience: '待确认', marketSize: '尚未取得市场规模证据', competitionLevel: '待确认', trendDirection: '待确认', keywords: [] },
  sentiment: { positive: null, neutral: null, negative: null, topPositive: [], topNegative: [] },
  xiaohongshu: { totalNotes: 0, totalEngagement: 0, avgLikes: 0, avgComments: 0, avgCollects: 0 },
  aiAnalysis: { feasibilityScore: null, overallVerdict: '尚需验证', strengths: [], weaknesses: [], suggestions: [], risks: [], analysisStatus: 'incomplete', decision: 'insufficient' },
  ...overrides,
});

describe.each([['HTML', generateReportHTML], ['PDF', generatePDFHTML]] as const)('%s 导出研究边界', (_name, generate) => {
  it('没有评分或分类时保留未知，不输出 null/NaN 或真实性结论', () => {
    const doc = new DOMParser().parseFromString(generate(report()), 'text/html');
    expect(doc.querySelector('.score-value')?.textContent).toBe('—');
    expect(doc.body.textContent).toContain('尚未评分');
    expect(doc.body.textContent).toContain('分析未完成');
    expect(doc.body.textContent).toContain('尚未取得情感分类数据');
    expect(doc.body.textContent).toContain('尚未实验');
    expect(doc.body.textContent).not.toMatch(/NaN|真实刚需|疑似伪需求|需求真实度/);
  });
  it('老报告的高分只保留为研究参考，不判定真实刚需', () => {
    const input = report();
    delete input.aiAnalysis.analysisStatus;
    input.score = 98;
    const text = new DOMParser().parseFromString(generate(input), 'text/html').body.textContent;
    expect(text).toContain('旧版研究判断');
    expect(text).not.toMatch(/真实刚需|疑似伪需求/);
  });
  it('完整分类中真实的 0% 可以导出', () => {
    const input = report({ sentiment: { positive: 0, neutral: 100, negative: 0, topPositive: [], topNegative: [] } });
    input.aiAnalysis.analysisStatus = 'complete';
    const text = new DOMParser().parseFromString(generate(input), 'text/html').body.textContent;
    expect(text).toContain('正面 0%');
    expect(text).not.toContain('NaN');
  });
});
