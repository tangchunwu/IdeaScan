import { describe, expect, it } from 'vitest';
import { buildValidationEvidence, buildEvidenceSummaryItems, buildIncompleteAnalysis, normalizeEvidenceAnalysis, buildValidationScope } from '../../supabase/functions/_shared/validation-evidence.ts';
import { applyContextBudget } from '../../supabase/functions/_shared/context-budgeter.ts';

const social = {
  totalNotes: 10000, avgLikes: 9000,
  sampleNotes: [{ note_id: 'p1', _platform: 'reddit', title: 'Shared plans', desc: 'How do we split costs?', url: 'https://www.reddit.com/r/travel/comments/p1/' }],
  sampleComments: [{ comment_id: 'c1', post_id: 'p1', _platform: 'reddit', content: 'I pay for an app every trip because collecting money takes hours.' }],
};

describe('validation evidence and honest analysis states', () => {
  it('does not turn orphan comments without parent identifiers into independent sources',()=>{
    const evidence=buildValidationEvidence({sampleComments:[{comment_id:'a',content:'I pay every month and still keep a spreadsheet'},{comment_id:'b',content:'I spend hours chasing confirmations every week'}]},[]);
    const result=normalizeEvidenceAnalysis({overallScore:99,aiAnalysis:{analysisStatus:'complete',decision:'test',evidenceAssessment:{support:[{claim:'Repeated work',evidenceIds:evidence.map(e=>e.id)}],counter:[],unknowns:[],nextExperiment:'Interview'}}},evidence);
    expect(result.aiAnalysis.decision).toBe('insufficient');expect(result.overallScore).toBeNull();
  });
  it('keeps comments and parent identity in evidence and summary inputs', () => {
    const evidence = buildValidationEvidence(social, []);
    const post = evidence.find(item => item.kind === 'post')!;
    const comment = evidence.find(item => item.kind === 'comment')!;
    expect(comment.content).toContain('collecting money takes hours');
    expect(comment.sourceKey).toBe(post.sourceKey);
    expect(comment.parentId).toBe(post.id);
    const summaries = buildEvidenceSummaryItems(evidence);
    expect(summaries[0].content).toContain(comment.id);
    expect(summaries[0].content).toContain('collecting money takes hours');
  });

  it('preserves identity across ordering and keeps same native IDs on different platforms distinct', () => {
    const other = { note_id: 'p1', _platform: 'twitter', title: 'Different post', desc: 'Need an alternative' };
    const first = buildValidationEvidence({ ...social, sampleNotes: [...social.sampleNotes, other] }, []);
    const second = buildValidationEvidence({ ...social, sampleNotes: [other, ...social.sampleNotes] }, []);
    expect(second.map(item => item.id).sort()).toEqual(first.map(item => item.id).sort());
    expect(new Set(first.map(item => item.id)).size).toBe(3);
  });

  it('never invents demand, sentiment, market size or scores after model failure', () => {
    const result = buildIncompleteAnalysis('模型分析未完成');
    expect(result.overallScore).toBeNull();
    expect(result.marketAnalysis.marketSize).toBeNull();
    expect(result.sentimentAnalysis).toEqual({ positive: null, neutral: null, negative: null });
    expect(result.aiAnalysis).toMatchObject({ feasibilityScore: null, analysisStatus: 'incomplete', decision: 'insufficient' });
    expect(result.dimensions).toEqual([]);
  });

  it('does not let empty or invented citations promote a research decision', () => {
    const evidence = buildValidationEvidence(social, []);
    const result = normalizeEvidenceAnalysis({ overallScore: 99, aiAnalysis: { feasibilityScore: 99, decision: 'test', evidenceAssessment: { support: [{ claim: 'Customers pay', evidenceIds: ['invented'] }] } } }, evidence);
    expect(result.overallScore).toBeNull();
    expect(result.aiAnalysis.decision).toBe('insufficient');
    expect(result.aiAnalysis.evidenceAssessment.support).toEqual([]);
  });

  it('does not count a parent and its comments as independent sources', () => {
    const evidence = buildValidationEvidence(social, []);
    const result = normalizeEvidenceAnalysis({ overallScore: 90, aiAnalysis: { decision: 'test', evidenceAssessment: { support: [{ claim: 'Repeated expense problem', evidenceIds: evidence.map(item => item.id) }] } } }, evidence);
    expect(result.aiAnalysis.decision).toBe('insufficient');
    expect(result.overallScore).toBeNull();
  });

  it('retains supported and opposing evidence but leaves unmeasured sentiment unknown', () => {
    const evidence = buildValidationEvidence(social, [{ title: 'Free alternative', url: 'https://budgetapp.com/pricing', snippet: 'Sharing a household plan is free.' }]);
    const post = evidence.find(item => item.kind === 'post')!;
    const comment = evidence.find(item => item.kind === 'comment')!;
    const competitor = evidence.find(item => item.kind === 'competitor')!;
    const result = normalizeEvidenceAnalysis({ overallScore: 64, sentimentAnalysis: { positive: 0, neutral: 100, negative: 0 }, aiAnalysis: { analysisStatus: 'complete', decision: 'reframe', evidenceAssessment: { support: [{ claim: 'Payment collection takes time', evidenceIds: [comment.id] }], counter: [{ claim: 'Free substitutes exist', evidenceIds: [competitor.id] }], unknowns: ['Target country not confirmed'], nextExperiment: 'Ask users about their last trip.' } } }, evidence);
    expect(result.aiAnalysis.analysisStatus).toBe('complete');
    expect(result.aiAnalysis.decision).toBe('reframe');
    expect(result.aiAnalysis.evidenceAssessment.counter[0].evidenceIds).toEqual([competitor.id]);
    expect(result.sentimentAnalysis.positive).toBeNull();
    expect(post.id).toBeTruthy();
  });

  it('treats research evidence as carried source records without trusting its conclusions', () => {
    const evidence = buildValidationEvidence({ sampleNotes: [], sampleComments: [] }, [], [{ id: 'e1', platform: 'reddit', title: 'Original complaint', snippet: 'We keep a spreadsheet every month', url: 'https://www.reddit.com/r/budget/comments/abc1/', collectedAt: '2026-10-20T00:00:00Z', kind: 'fact' }]);
    expect(evidence[0]).toMatchObject({ kind: 'research', origin: 'research_handoff', content: 'We keep a spreadsheet every month' });
    const result = normalizeEvidenceAnalysis({}, evidence);
    expect(result.aiAnalysis.decision).toBe('insufficient');
    expect(result.overallScore).toBeNull();
  });

  it('keeps a low-like concrete user experience ahead of viral promotional comments', () => {
    const useful = { comment_id: 'useful', post_id: 'p2', _platform: 'reddit', content: 'I pay every month and still spend hours fixing the shared budget manually.', like_count: 0 };
    const noise = Array.from({ length: 30 }, (_, index) => ({ comment_id: `ad-${index}`, post_id: 'promo', _platform: 'twitter', content: `Great launch, visit our shop for amazing deals ${index}`, like_count: 1000000 + index }));
    const result = applyContextBudget({ sampleNotes: [], sampleComments: [...noise, useful] }, [], 'quick');
    expect(result.socialData.sampleComments.some((item: { comment_id: string }) => item.comment_id === 'useful')).toBe(true);
  });

  it('computes zero sentiment only from valid comment classifications and deduplicates labels', () => {
    const evidence = buildValidationEvidence(social, []);
    const comment = evidence.find(item => item.kind === 'comment')!;
    const result = normalizeEvidenceAnalysis({ aiAnalysis: { analysisStatus: 'complete', decision: 'insufficient', evidenceAssessment: { support: [], counter: [], unknowns: ['Only one source'], nextExperiment: 'Collect another source' } }, sentimentLabels: [{ evidenceId: comment.id, sentiment: 'neutral' }, { evidenceId: comment.id, sentiment: 'positive' }, { evidenceId: 'fake', sentiment: 'positive' }] }, evidence);
    expect(result.sentimentAnalysis).toEqual({ positive: 0, neutral: 100, negative: 0 });
  });

  it('binds resumed evidence to idea, market, research reference and selected platforms', () => {
    const config = { marketContext: { country: 'Japan', countryCode: 'JP', language: 'ja' }, overseasPlatforms: ['twitter', 'reddit'], enableXiaohongshu: false, researchSessionId: 'session1', researchCandidateId: 'candidate1' };
    const scope = buildValidationScope('Trip expenses', ['budget', 'travel'], config);
    expect(buildValidationScope('Trip expenses', ['travel', 'budget'], { ...config, overseasPlatforms: ['reddit', 'twitter'], llmApiKey: 'never-store' })).toBe(scope);
    expect(buildValidationScope('Different idea', ['budget', 'travel'], config)).not.toBe(scope);
    expect(buildValidationScope('Trip expenses', ['budget', 'travel'], { ...config, marketContext: { country: 'US', countryCode: 'US', language: 'en' } })).not.toBe(scope);
    expect(buildValidationScope('Trip expenses', ['budget', 'travel'], { ...config, researchCandidateId: 'candidate2' })).not.toBe(scope);
    expect(scope).not.toContain('never-store');
  });

  it.each([
    ['promotions', ['Visit our shop! Use my code DEAL20 to buy now.', 'Limited offer, subscribe now and get 50% off!']],
    ['entertainment reactions', ['哈哈哈哈 😂', 'Looks great! Love it 😍']],
  ])('does not turn two %s sources into a promising demand merely because the model gives 99', (_name, contents) => {
    const evidence = buildValidationEvidence({ sampleNotes: contents.map((content, index) => ({ note_id: `p${index}`, _platform: 'twitter', desc: content })), sampleComments: [] }, []);
    const result = normalizeEvidenceAnalysis({ overallScore: 99, aiAnalysis: { analysisStatus: 'complete', decision: 'test', evidenceAssessment: { support: [{ claim: 'People will pay for this', evidenceIds: evidence.map(item => item.id) }], counter: [], unknowns: ['Payment not verified'], nextExperiment: 'Talk to users' } } }, evidence);
    expect(result.overallScore).toBeNull();
    expect(result.aiAnalysis.decision).toBe('insufficient');
    expect(result.aiAnalysis.evidenceAssessment.unknowns.join(' ')).toContain('娱乐');
  });

  it('does not count competitor pricing pages as direct evidence of customer demand', () => {
    const evidence = buildValidationEvidence({}, [
      { url: 'https://oneapp.com/pricing', snippet: 'Subscription costs $9 per month.' },
      { url: 'https://twoapp.com/pricing', snippet: 'Our paid plan costs $12 per month.' },
    ]);
    const result = normalizeEvidenceAnalysis({ overallScore: 99, aiAnalysis: { analysisStatus: 'complete', decision: 'test', evidenceAssessment: { support: [{ claim: 'This market is validated', evidenceIds: evidence.map(item => item.id) }], counter: [], unknowns: ['Real customers unknown'], nextExperiment: 'Talk to users' } } }, evidence);
    expect(result.aiAnalysis.decision).toBe('insufficient');
    expect(result.overallScore).toBeNull();
  });

  it('preserves recurring emotional or ritual use instead of requiring efficiency or payment words', () => {
    const evidence = buildValidationEvidence({ sampleNotes: [
      { note_id: 'ritual1', _platform: 'threads', desc: '毎晩アプリで願いを書いて、気持ちが落ち着きます。' },
      { note_id: 'ritual2', _platform: 'reddit', desc: 'I light a virtual candle every night and share a memory with my sister.' },
    ] }, []);
    const result = normalizeEvidenceAnalysis({ overallScore: 60, aiAnalysis: { analysisStatus: 'complete', decision: 'test', evidenceAssessment: { support: [{ claim: 'A recurring private ritual is valued', evidenceIds: evidence.map(item => item.id) }], counter: [], unknowns: ['Payment not verified'], nextExperiment: 'Test a small ritual card' } } }, evidence);
    expect(result.aiAnalysis.decision).toBe('test');
    expect(result.overallScore).toBe(60);
  });

  it.each([{}, { aiAnalysis: { analysisStatus: 'complete', evidenceAssessment: { support: 'malformed' } } }])('keeps missing or malformed analysis resumable instead of marking it complete', (raw) => {
    const result = normalizeEvidenceAnalysis(raw, []);
    expect(result.aiAnalysis.analysisStatus).toBe('incomplete');
    expect(result.overallScore).toBeNull();
  });

  it('keeps every rounded sentiment percentage nonnegative and the total equal to 100', () => {
    const evidence = buildValidationEvidence({ sampleComments: Array.from({ length: 40 }, (_, index) => ({ _platform: 'reddit', comment_id: `c${index}`, post_id: `p${index}`, content: `Classify response ${index}` })) }, []);
    const result = normalizeEvidenceAnalysis({ aiAnalysis: { analysisStatus: 'complete', decision: 'insufficient', evidenceAssessment: { support: [], counter: [], unknowns: ['Demand unknown'], nextExperiment: 'Collect more context' } }, sentimentLabels: evidence.map((item, index) => ({ evidenceId: item.id, sentiment: index < 13 ? 'positive' : 'negative' })) }, evidence);
    const values = Object.values(result.sentimentAnalysis);
    expect(values.every(value => value !== null && value >= 0 && value <= 100)).toBe(true);
    expect(values.reduce((sum, value) => sum + (value || 0), 0)).toBe(100);
    expect(result.sentimentAnalysis.neutral).toBe(0);
  });
});
