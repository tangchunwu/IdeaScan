import { describe, expect, it } from 'vitest';
import { deriveEvidenceGaps } from '@/lib/researchGaps';
import type { OpportunityCandidate, OpportunityResult } from '@/types/opportunity';

const base: OpportunityCandidate = { id:'c1',title:'日常协同',problem:'经常手工协调',targetUsers:'小团队',urgency:'medium',evidenceCount:2,competitionHint:'',recommendedNextStep:'',risks:[],kind:'hypothesis',evidence:[{id:'e1',platform:'reddit',title:'原文',snippet:'我每周手工做这件事',url:'https://reddit.com/r/x/comments/a',collectedAt:'2026-11-04',kind:'fact'}] };
const request: OpportunityResult['request'] = {country:'Japan',countryCode:'JP',language:'ja',industry:'兴趣',platforms:['reddit'],mode:'deep'};
describe('研究证据缺口',()=>{
  it('列出支持、反证、付款和实验缺口，并避免把缺口写成结论',()=>{
    const gaps=deriveEvidenceGaps({...base,evidenceCount:1,evidence:[],support:[],counter:[],unknowns:['目标用户所在地未知'],paymentEvidence:'unknown'},request);
    expect(gaps.map(g=>g.id)).toEqual(expect.arrayContaining(['independent_sources','supporting_experience','counter_evidence','payment','experiment']));
    expect(gaps.every(g=>g.action&&g.reason)).toBe(true);
  });
  it('完整支持与反证候选只保留真正的地域和付款未知',()=>{
    const gaps=deriveEvidenceGaps({...base,evidenceCount:2,evidence:[...base.evidence,{id:'e2',platform:'youtube',title:'第二条',snippet:'另一个独立来源',url:'https://youtube.com/watch?v=12345678901',collectedAt:'2026-11-04',kind:'fact',language:'ja'}],support:[{claim:'每周手工做',evidenceIds:['e1']}],counter:[{claim:'免费表格可用',evidenceIds:['e1']}],unknowns:[],paymentEvidence:'pricing',experiment:'向5人报价'},request);
    expect(gaps).toEqual([]);
  });
  it('历史材料缺少语言时列为地域证据缺口',()=>{
    const gaps=deriveEvidenceGaps({...base,support:[{claim:'重复任务',evidenceIds:['e1']}],counter:[{claim:'替代存在',evidenceIds:['e1']}],paymentEvidence:'reported_purchase',experiment:'询价'},request);
    expect(gaps.map(g=>g.id)).toContain('locality');
  });
});
