import type { OpportunityCandidate, OpportunityRequest } from '@/types/opportunity';

export interface EvidenceGap { id: string; title: string; reason: string; action: string; priority: 'high' | 'medium' | 'low' }

export function deriveEvidenceGaps(candidate: OpportunityCandidate, request: OpportunityRequest): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  const support = candidate.support || [];
  const counter = candidate.counter || [];
  const evidence = candidate.evidence || [];
  if (candidate.evidenceCount < 2 || evidence.length < 2) gaps.push({ id:'independent_sources', title:'独立原始来源不足', reason:'当前来源数量不足以区分重复转述与独立经历。', action:'补充另一个平台、作者或不同原帖的同类经历。', priority:'high' });
  if (!support.length) gaps.push({ id:'supporting_experience', title:'缺少直接用户经历', reason:'当前没有经过原文引用校验的支持主张。', action:'寻找用户描述最近一次具体经历、现有做法和付出。', priority:'high' });
  if (!counter.length) gaps.push({ id:'counter_evidence', title:'缺少反证', reason:'目前只看到支持方向，尚未核对免费替代、放弃原因或低复用。', action:'搜索免费方案、用户吐槽、退款或“已经够用”的原文。', priority:'high' });
  if (!candidate.paymentEvidence || candidate.paymentEvidence === 'unknown') gaps.push({ id:'payment', title:'付费信号未知', reason:'公开讨论不能直接证明用户愿意为这个小应用付费。', action:'核对竞品价格，并向目标用户做一次报价或付费意愿测试。', priority:'high' });
  if (!candidate.experiment) gaps.push({ id:'experiment', title:'没有最小验证动作', reason:'候选还没有明确下一步怎样用最少成本验证。', action:'写出一个一周内可执行的访谈、落地页、报价或试用实验。', priority:'medium' });
  if (request.language && evidence.length && evidence.every(item => !item.language || !item.language.toLowerCase().startsWith(request.language!.slice(0,2).toLowerCase()))) gaps.push({ id:'locality', title:'目标市场语言证据不足', reason:`目标市场使用 ${request.language}，当前原文没有明确的语言匹配证据。`, action:'用目标语言补查同一场景，并核实来源所在地而非只看检索国家。', priority:'medium' });
  return gaps;
}
