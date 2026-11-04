import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOpportunityPrompt, parseOpportunityRequest, runOpportunityResearch } from '../../supabase/functions/opportunity-discover/core';
import { collectOpportunitySources, collectOpportunityFollowUpSources } from '../../supabase/functions/opportunity-discover/sources';
import type { OpportunityEvidence, OpportunityRequest } from '../types/opportunity';

const request = (extra: Record<string, unknown> = {}) => ({ country: 'Japan', industry: 'Concert travel', platforms: ['reddit'], mode: 'quick', ...extra });
const evidence = (id: string, platform = 'reddit', url = `https://www.reddit.com/r/travel/comments/${id}/trip/`): OpportunityEvidence => ({
  id, platform, title: 'Trip coordination', snippet: 'I paid for the group and cannot reconcile the costs.', url,
  collectedAt: '2026-11-04T00:00:00Z', kind: 'fact',
});
const sources = (items: OpportunityEvidence[]) => ({ evidence: items, warnings: [], postCount: items.length, commentCount: 0, apiCalls: 1 });
const candidate = (extra: Record<string, unknown> = {}) => ({
  title: '遠征の立替精算', problem: 'Group cost reconciliation', targetUsers: 'Friends travelling to concerts',
  urgency: 'medium', evidenceIds: ['e1', 'e2'], decision: 'test', support: [{ claim: 'Users advance costs', evidenceIds: ['e1'] }],
  counter: [{ claim: 'A spreadsheet already works', evidenceIds: ['e2'] }], unknowns: ['Local willingness to pay'],
  mvp: 'One shared trip ledger', experiment: 'Deliver one shared ledger to five groups', paymentEvidence: 'unknown', ...extra,
});
afterEach(() => vi.unstubAllGlobals());

describe('radar research quality', () => {
  it('allows a ritual or reassurance discovery without forcing an industry', () => {
    expect(parseOpportunityRequest(request({ industry: '', opportunityType: 'ritual', language: 'ja' })))
      .toMatchObject({ industry: '', opportunityType: 'ritual', language: 'ja' });
    expect(() => parseOpportunityRequest(request({ industry: '', keyword: '', opportunityType: 'invented' }))).toThrow();
  });

  it.each([
    ['https://x.com/alice/status/1234567890123456789', 'https://twitter.com/bob/status/1234567890123456789'],
    ['https://www.threads.net/@alice/post/AbCd12', 'https://www.threads.com/@alice/post/AbCd12'],
  ])('counts %s and its alias as one original source', async (url, alias) => {
    const analyze = vi.fn();
    const result = await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one', 'social', url), evidence('two', 'social', alias)]), analyze,
    });
    expect(result.stats.sourceCount).toBe(1);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('attaches claim-level evidence and refuses an invented supporting claim', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one'), evidence('two')]),
      analyze: async () => ({ candidates: [candidate(), candidate({ title: 'Invented', support: [{ claim: 'Everyone pays', evidenceIds: ['fabricated'] }] })] }),
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ support: candidate().support, counter: candidate().counter, unknowns: ['Local willingness to pay'], paymentEvidence: 'unknown' });
    expect(result.candidates[0].evidence.map(item => item.id)).toEqual(['e1', 'e2']);
  });

  it('rejects a claimed purchase without a supporting quote instead of treating pricing as payment', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one'), evidence('two')]),
      analyze: async () => ({ candidates: [candidate({ paymentEvidence: 'verified_payment' })] }),
    });
    expect(result.candidates[0].paymentEvidence).toBe('unknown');
  });

  it('does not recommend a test based only on entertainment signals or fabricated quotes', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one'), evidence('two')]),
      analyze: async () => ({ signals: [
        { type: 'experience', quote: 'This quote never appeared', evidenceIds: ['e1'] },
        { type: 'entertainment', quote: 'I paid for the group', evidenceIds: ['e1'] },
      ], candidates: [candidate()] }),
    });
    expect(result.signals).toHaveLength(1);
    expect(result.candidates[0].decision).toBe('insufficient');
  });

  it('keeps a research recommendation when the supporting claim refers to a quoted experience', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one'), evidence('two')]),
      analyze: async () => ({ signals: [{ type: 'experience', quote: 'I paid for the group', evidenceIds: ['e1'], user: 'Concert friends', trigger: 'Group travel', task: 'Reconcile shared expenses' }], candidates: [candidate()] }),
    });
    expect(result.candidates[0].decision).toBe('test');
    expect(result.signals?.[0].quote).toBe('I paid for the group');
  });

  it('preserves diverse platforms when a single fast provider floods the source budget', async () => {
    let analyzed: OpportunityEvidence[] = [];
    await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([...Array.from({ length: 70 }, (_, i) => evidence(`a${i}`, 'web', `https://news.example.org/${i}`)), evidence('last', 'threads', 'https://www.threads.com/@alice/post/ZZxx12')]),
      analyze: async items => { analyzed = items; return { candidates: [] }; },
    });
    expect(analyzed).toHaveLength(60);
    expect(analyzed.some(item => item.platform === 'threads')).toBe(true);
  });

  it('runs one bounded follow-up and re-analysis only in deep mode', async () => {
    const followUp = vi.fn(async () => ({ ...sources([evidence('three', 'web', 'https://official.example.org/pricing')]), apiCalls: 2 }));
    const analyze = vi.fn(async (_items: OpportunityEvidence[]) => ({ candidates: [candidate()] }));
    const result = await runOpportunityResearch(parseOpportunityRequest(request({ mode: 'deep' })), {
      collect: async () => sources([evidence('one'), evidence('two')]), analyze, followUp,
    } as Parameters<typeof runOpportunityResearch>[1]);
    expect(followUp).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect((analyze.mock.calls[1]?.[0] as unknown[]).length).toBe(3);
    expect(result.stats.apiCalls).toBe(3);
    const quickFollowUp = vi.fn();
    await runOpportunityResearch(parseOpportunityRequest(request()), {
      collect: async () => sources([evidence('one'), evidence('two')]), analyze, followUp: quickFollowUp,
    } as Parameters<typeof runOpportunityResearch>[1]);
    expect(quickFollowUp).not.toHaveBeenCalled();
  });

  it('does not call an unreviewed first-pass candidate fully researched after follow-up failure', async () => {
    const result = await runOpportunityResearch(parseOpportunityRequest(request({ mode: 'deep' })), {
      collect: async () => sources([evidence('one'), evidence('two')]),
      analyze: async () => ({ candidates: [candidate()] }), followUp: async () => { throw new Error('upstream secret'); },
    } as Parameters<typeof runOpportunityResearch>[1]);
    expect(result.candidates[0].decision).toBe('insufficient');
    expect(result.warnings.join(' ')).toContain('复核');
    expect(JSON.stringify(result)).not.toContain('upstream secret');
  });

  it('asks for experiences, emotional value, alternatives and counter evidence without inventing payment', () => {
    const prompt = buildOpportunityPrompt(parseOpportunityRequest(request({ opportunityType: 'ritual' })), [evidence('one')]);
    expect(prompt).toMatch(/仪式|情绪/);
    expect(prompt).toContain('反证');
    expect(prompt).toContain('evidenceIds');
    expect(prompt).toContain('付费');
  });

  it('executes Japanese query intent with JP rather than a hard-coded country', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: { web: [] } })));
    vi.stubGlobal('fetch', fetcher);
    const output = await collectOpportunitySources(parseOpportunityRequest(request({ industry: '远征', platforms: [], language: 'ja' })), { youApiKey: 'offline-only' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get('country')).toBe('JP');
    expect(url.searchParams.get('query')).toMatch(/遠征|立替|精算/);
    expect(url.searchParams.get('query')).not.toContain('Japan');
    expect(output.queryPlan).toMatchObject([{ platform: 'you', language: 'ja', intent: 'experience' }]);
  });

  it('bounds deep follow-up to two candidates and three independent intents each', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: [] })));
    vi.stubGlobal('fetch', fetcher);
    const input = parseOpportunityRequest(request({ mode: 'deep', platforms: [], language: 'ja' }));
    const candidates = Array.from({ length: 5 }, (_, i) => ({ ...candidate(), title: `遠征 ${i}`, id: `c${i}`, kind: 'hypothesis', evidenceCount: 2, evidence: [] }));
    const result = await collectOpportunityFollowUpSources(input, { tavilyApiKey: 'offline-only' }, candidates as never);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(result.apiCalls).toBe(6);
    expect(new Set(result.queryPlan?.map(query => query.intent))).toEqual(new Set(['payment', 'alternative', 'counter']));
    expect(fetcher.mock.calls.every(call => call[1]?.redirect === 'error')).toBe(true);
  });
});
