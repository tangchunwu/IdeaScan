import { describe, expect, it, vi } from 'vitest';
import { calculateResearchQuality, parseOpportunityRequest, runOpportunityResearch } from '../../supabase/functions/opportunity-discover/core';
import type { OpportunityEvidence, OpportunityRequest } from '../types/opportunity';

const request: OpportunityRequest = { country: 'United States', industry: 'Accounting', platforms: ['reddit'], mode: 'quick' };
const evidence: OpportunityEvidence[] = [1, 2, 3].map(n => ({ id: `e${n}`, title: `Pain ${n}`, snippet: 'Manual workflow is slow', url: `https://example.com/${n}`, platform: 'web', collectedAt: '2026-11-02T00:00:00Z', kind: 'fact' }));
const candidate = { title: 'Invoice workflow', problem: 'Manual entry', targetUsers: 'Small firms', urgency: 'high', evidenceIds: ['e1', 'e2'], competitionHint: 'Unknown', recommendedNextStep: 'Interview users', risks: ['Willingness to pay unverified'] };
const collect = async () => ({ evidence, warnings: [], postCount: 3, commentCount: 0, apiCalls: 2 });

describe('opportunity research boundaries', () => {
  it('reports concrete research gaps instead of treating source count as demand proof', () => {
    const quality = calculateResearchQuality(
      { ...request, valueModel: 'entertainment', language: 'ja' } as Parameters<typeof calculateResearchQuality>[0],
      evidence,
      [{ id: 's1', evidenceIds: ['e1'], user: 'fan', trigger: 'event', task: 'share', currentWorkaround: 'chat', cost: '', recurrence: '', payment: '', type: 'entertainment', quote: 'Manual workflow is slow' }],
    );
    expect(quality.status).toBe('partial');
    expect(quality.independentSourceCount).toBe(3);
    expect(quality.evidenceTypes.experience).toBe(1);
    expect(quality.gaps).toEqual(expect.arrayContaining(['没有复玩或回访证据', '没有付费、价格或购买自述']));
  });
  it('validates inputs and deduplicates platforms', () => {
    expect(parseOpportunityRequest({ ...request, platforms: ['reddit', 'reddit'] }).platforms).toEqual(['reddit']);
    for (const invalid of [{ ...request, country: '' }, { ...request, platforms: ['evil'] }, { ...request, mode: 'unlimited' }, { ...request, keyword: 'x'.repeat(201) }]) {
      expect(() => parseOpportunityRequest(invalid)).toThrow();
    }
  });
  it('attaches only original evidence and returns fewer than three honestly', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request), { collect, analyze: async () => ({ candidates: [candidate] }) });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].evidence).toEqual(evidence.slice(0, 2));
    expect(result.candidates[0].kind).toBe('hypothesis');
    expect(result.stats).toMatchObject({ sourceCount: 3, postCount: 3, apiCalls: 2 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('rejects fabricated citations, duplicate source support and invalid urgency', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request), { collect, analyze: async () => ({ candidates: [
      { ...candidate, evidenceIds: ['e1', 'invented'] },
      { ...candidate, evidenceIds: ['e1', 'e1'] },
      { ...candidate, urgency: 'certain' },
    ] }) });
    expect(result.candidates).toEqual([]);
  });
  it('deduplicates URLs before deciding there is enough evidence', async () => {
    const analyze = vi.fn();
    const result = await runOpportunityResearch(parseOpportunityRequest(request), { collect: async () => ({ evidence: [evidence[0], { ...evidence[0], id: 'other' }], warnings: [], postCount: 2, commentCount: 0, apiCalls: 1 }), analyze });
    expect(analyze).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
  });
  it('does not count different XHS sharing tokens as independent evidence', async () => {
    const analyze = vi.fn();
    const noteUrl = 'https://www.xiaohongshu.com/explore/abcdef1234567890abcdef12';
    const result = await runOpportunityResearch(parseOpportunityRequest(request), {
      collect: async () => ({ evidence: [
        { ...evidence[0], url: `${noteUrl}?xsec_token=one&xsec_source=share` },
        { ...evidence[1], url: `${noteUrl}?xsec_token=two&xsec_source=search` },
      ], warnings: [], postCount: 2, commentCount: 0, apiCalls: 1 }), analyze,
    });
    expect(result.stats.sourceCount).toBe(1);
    expect(analyze).not.toHaveBeenCalled();
  });
  it('keeps comments as context without counting them as independent sources', async () => {
    const analyze = vi.fn(async () => ({ candidates: [candidate] }));
    const result = await runOpportunityResearch(parseOpportunityRequest(request), {
      collect: async () => ({ evidence: [evidence[0], { ...evidence[0], id: 'comment', title: '用户评论', snippet: 'I spend hours doing this by hand', url: `${evidence[0].url}?utm_source=share#comment` }, evidence[1]], warnings: [], postCount: 2, commentCount: 1, apiCalls: 1 }), analyze,
    });
    expect(result.stats.sourceCount).toBe(2);
    expect(result.candidates[0].evidence[0].snippet).toContain('I spend hours');
    expect(result.candidates[0].evidenceCount).toBe(2);
  });
  it('returns explicit failure warning without invented candidates on AI failure', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request), { collect, analyze: async () => { throw new Error('secret-upstream-body'); } });
    expect(result.candidates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('secret-upstream-body');
    expect(result.warnings.some(w => w.includes('分析'))).toBe(true);
  });
});
