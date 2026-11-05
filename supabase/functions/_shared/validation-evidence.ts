/** 原文证据、模型推断与未完成状态的共享合同。模型分数不是需求成立或真实支付证明。 */
export interface ValidationEvidence {
  id: string;
  kind: 'post' | 'comment' | 'competitor' | 'research';
  platform: string;
  title: string;
  content: string;
  snippet: string;
  sourceKey: string;
  postId?: string;
  parentId?: string;
  url?: string;
  createdAt?: string;
  origin: 'collection' | 'research_handoff';
}

export interface EvidenceClaim { claim: string; evidenceIds: string[] }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, limit = 1600): string => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const strings = (value: unknown, max = 8) => list(value).map(item => text(item, 500)).filter(Boolean).slice(0, max);

/** 断点只复用相同研究范围；只挑非敏感业务字段，绝不序列化完整配置。 */
export function buildValidationScope(idea: string, tags: string[], configInput: unknown): string {
  const config = object(configInput);
  const market = object(config.marketContext);
  return JSON.stringify({
    version: 1, idea: idea.trim(), tags: [...new Set(tags.map(tag => tag.trim()).filter(Boolean))].sort(),
    market: config.marketContext ? { country: text(market.country, 80), countryCode: text(market.countryCode, 2), language: text(market.language, 20), opportunityType: text(market.opportunityType, 80), valueModel: text(market.valueModel, 20) } : null,
    platforms: [...new Set([...(config.enableXiaohongshu !== false ? ['xiaohongshu'] : []), ...(config.enableDouyin === true ? ['douyin'] : []), ...strings(config.overseasPlatforms)])].sort(),
    researchSessionId: text(config.researchSessionId, 80), researchCandidateId: text(config.researchCandidateId, 120),
  });
}

function stableId(value: string): string {
  // 双 32 位散列使 ID 与输入次序无关；原始来源键另外保留用于复核和独立来源计数。
  let first = 2166136261, second = 3335557771;
  for (let i = 0; i < value.length; i++) {
    first = Math.imul(first ^ value.charCodeAt(i), 16777619);
    second = Math.imul(second ^ value.charCodeAt(i), 2246822519);
  }
  return `ev-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return undefined; }
}
function urlSourceKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const source = new URL(url);
  const host = source.hostname.toLowerCase().replace(/^www\./, '');
  if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) {
    const id = source.pathname.match(/\/status\/(\d+)/)?.[1];
    if (id) return `twitter:post:${id}`;
  }
  if (['threads.com', 'threads.net'].includes(host)) {
    const code = source.pathname.match(/\/post\/([^/]+)/)?.[1];
    if (code) return `threads:post:${code}`;
  }
  if (host === 'reddit.com' || host === 'old.reddit.com') {
    const id = source.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1];
    if (id) return `reddit:post:${id.replace(/^t3_/, '')}`;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const id=host==='youtu.be'?source.pathname.slice(1).split('/')[0]:source.searchParams.get('v')||source.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    if(id&&/^[\w-]{11}$/.test(id))return `youtube:post:${id}`;
  }
  return `${host}${source.pathname.replace(/\/$/, '')}${source.search}`;
}

export function buildValidationEvidence(socialInput: unknown, competitorInput: unknown, carriedInput: unknown = []): ValidationEvidence[] {
  const social = object(socialInput);
  const evidence = new Map<string, ValidationEvidence>();
  const parents = new Map<string, ValidationEvidence>();
  const add = (item: ValidationEvidence) => { if (item.content && !evidence.has(item.id)) evidence.set(item.id, item); };
  for (const raw of list(social.sampleNotes).slice(0, 24)) {
    const note = object(raw);
    const platform = text(note._platform || note.platform, 40) || 'unknown';
    const nativeId = text(String(note.note_id || note.post_id || note.aweme_id || note.id || ''), 120);
    const title = text(note.title, 180);
    const content = text([title, note.desc || note.content].filter(Boolean).join('\n'));
    const url = safeUrl(note.url || note.share_url);
    const sourceKey = urlSourceKey(url) || (nativeId ? `${platform}:post:${nativeId}` : `${platform}:unattributed:posts`);
    const item: ValidationEvidence = { id: stableId(`${platform}:post:${nativeId || sourceKey}`), kind: 'post', platform, title, content, snippet: content, sourceKey, postId: nativeId, url, createdAt: text(note.created_at || note.publish_time, 80) || undefined, origin: 'collection' };
    add(item);
    if (nativeId) parents.set(`${platform}:${nativeId}`, item);
  }
  for (const raw of list(social.sampleComments).slice(0, 48)) {
    const comment = object(raw);
    const platform = text(comment._platform || comment.platform, 40) || 'unknown';
    const postId = text(String(comment.post_id || ''), 120);
    const parent = parents.get(`${platform}:${postId}`);
    const content = text(comment.content || comment.text, 1000);
    const nativeId = text(String(comment.comment_id || comment.id || ''), 120);
    const url = safeUrl(comment.url) || parent?.url;
    add({ id: stableId(`${platform}:comment:${nativeId || `${postId}:${content}`}`), kind: 'comment', platform, title: '用户评论', content, snippet: content,
      sourceKey: parent?.sourceKey || urlSourceKey(url) || (postId ? `${platform}:post:${postId}` : `${platform}:unattributed:comments`), postId, parentId: parent?.id, url,
      createdAt: text(comment.created_at || comment.create_time, 80) || undefined, origin: 'collection' });
  }
  for (const raw of list(competitorInput).slice(0, 14)) {
    const competitor = object(raw);
    const content = text(competitor.cleanedContent || competitor.snippet, 1800);
    const url = safeUrl(competitor.url);
    // 无链接的竞品描述仍可展示，不能凭重复名称伪装多个独立来源。
    const sourceKey = urlSourceKey(url) || `competitor:${stableId(content)}`;
    add({ id: stableId(`competitor:${sourceKey}`), kind: 'competitor', platform: text(competitor.source, 40) || 'web', title: text(competitor.title, 180), content, snippet: content, sourceKey, url, origin: 'collection' });
  }
  for (const raw of list(carriedInput).slice(0, 20)) {
    const item = object(raw);
    const url = safeUrl(item.url);
    if (!url) continue;
    const content = text(item.snippet || item.content, 1800);
    const sourceKey = urlSourceKey(url)!;
    if ([...evidence.values()].some(existing => existing.sourceKey === sourceKey && existing.content === content)) continue;
    add({ id: stableId(`research:${sourceKey}:${content}`), kind: 'research', platform: text(item.platform, 40) || 'web', title: text(item.title, 180), content, snippet: content, sourceKey, url, createdAt: text(item.collectedAt, 80) || undefined, origin: 'research_handoff' });
  }
  return [...evidence.values()];
}

export function buildEvidenceSummaryItems(evidence: ValidationEvidence[]): Array<{ content: string; type: 'social_post' | 'competitor_page' }> {
  const groups = new Map<string, ValidationEvidence[]>();
  for (const item of evidence) {
    const group = groups.get(item.sourceKey) || [];
    group.push(item);
    groups.set(item.sourceKey, group);
  }
  return [...groups.values()].slice(0, 16).map(group => ({
    content: group.map(item => `[${item.id}] ${item.kind === 'comment' ? '评论' : item.kind === 'competitor' ? '竞品原文' : '原帖'}：${item.content}`).join('\n').slice(0, 5000),
    type: group.every(item => item.kind === 'competitor') ? 'competitor_page' : 'social_post',
  }));
}

export function buildIncompleteAnalysis(message = '分析未完成，已保留原始证据，可继续分析。') {
  return {
    overallScore: null,
    overallVerdict: message,
    marketAnalysis: { targetAudience: null, marketSize: null, competitionLevel: null },
    sentimentAnalysis: { positive: null, neutral: null, negative: null },
    aiAnalysis: {
      feasibilityScore: null, overallVerdict: message, analysisStatus: 'incomplete' as const, decision: 'insufficient' as const,
      strengths: [] as string[], weaknesses: [] as string[], risks: ['模型分析未完成；不能据此判断需求成立或不存在。'], suggestions: ['保留当前证据并继续分析，或补充目标用户的实际经历。'],
      monetizationStrategies: [], brandNames: [],
      evidenceAssessment: { support: [] as EvidenceClaim[], counter: [] as EvidenceClaim[], unknowns: ['需求强度、付费意愿、目标市场匹配尚待核实。'], nextExperiment: '先补充或重新分析证据，再确定最小实验。' },
    },
    persona: null,
    dimensions: [],
  };
}

function normalizeClaims(value: unknown, ids: Set<string>): EvidenceClaim[] {
  return list(value).slice(0, 8).flatMap(raw => {
    const item = object(raw);
    const claim = text(item.claim, 500);
    const rawIds = list(item.evidenceIds);
    const evidenceIds = rawIds.filter((id): id is string => typeof id === 'string' && ids.has(id));
    if (!claim || !evidenceIds.length || evidenceIds.length !== rawIds.length) return [];
    return [{ claim, evidenceIds: [...new Set<string>(evidenceIds)].slice(0, 12) }];
  });
}
function nullableScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}
function classifiedSentiment(value: unknown, evidence: ValidationEvidence[]) {
  const comments = new Set(evidence.filter(item => item.kind === 'comment').map(item => item.id));
  const labels = list(value);
  const seen = new Set<string>();
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const raw of labels) {
    const label = object(raw);
    if (typeof label.evidenceId !== 'string' || typeof label.sentiment !== 'string' || !comments.has(label.evidenceId) || seen.has(label.evidenceId) || !['positive', 'neutral', 'negative'].includes(label.sentiment)) continue;
    seen.add(label.evidenceId);
    counts[label.sentiment as keyof typeof counts] += 1;
  }
  if (!seen.size) return { positive: null, neutral: null, negative: null };
  // 最大余数法避免分别四舍五入后出现负中性比例或总和 101%。
  const keys = ['positive', 'neutral', 'negative'] as const;
  const fractions = keys.map(key => ({ key, exact: counts[key] * 100 / seen.size }));
  const percentages = { positive: 0, neutral: 0, negative: 0 };
  for (const item of fractions) percentages[item.key] = Math.floor(item.exact);
  const remaining = 100 - keys.reduce((sum, key) => sum + percentages[key], 0);
  fractions.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let index = 0; index < remaining; index++) percentages[fractions[index].key] += 1;
  return percentages;
}

/** 只排除明确不构成用户需求的来源；未命中不意味着需求成立。 */
function isDirectDemandEvidence(item: ValidationEvidence): boolean {
  if (item.kind === 'competitor') return false;
  const content = item.content.trim();
  const promotion = /(?:visit our (?:shop|site)|use (?:my|our) code|limited offer|subscribe now|buy now|\bget \d+% off|限时优惠|扫码购买|优惠券|立即购买|推广链接)/i.test(content);
  // 允许用户描述反复遭遇广告等真实经历，不把其中的促销用语机械地当成作者推广。
  const userExperience = /(?:\b(?:I|we) (?:use|used|pay|paid|spend|spent|keep|kept|receive|received|see|saw|have to|had to)\b|我(?:每|一直|用了|支付|收到|花了)|我们(?:每|一直|用了|收到))/.test(content);
  if (promotion && !userExperience) return false;
  const reactionWords = content.toLowerCase().replace(/[\p{P}\p{S}\s\d]/gu, '');
  if (!reactionWords || /^(?:(?:ha)+|lol|lmao|nice|great|awesome|beautiful|cool|amazing|looksgreat|loveit|哈哈+|好看|漂亮|赞|太棒了|かわいい|可愛い|すごい|ㅋㅋ+|귀여워)+$/.test(reactionWords)) return false;
  return true;
}

function hasAnalysisContract(ai: Record<string, unknown>, assessment: Record<string, unknown>): boolean {
  if (ai.analysisStatus !== 'complete' || typeof ai.decision !== 'string' || !['test', 'reframe', 'pause', 'insufficient'].includes(ai.decision)) return false;
  if (!Array.isArray(assessment.support) || !Array.isArray(assessment.counter) || !Array.isArray(assessment.unknowns) || typeof assessment.nextExperiment !== 'string' || !assessment.nextExperiment.trim()) return false;
  if (assessment.unknowns.some(value => typeof value !== 'string')) return false;
  const claims = [...assessment.support, ...assessment.counter];
  if (claims.some(value => {
    const claim = object(value);
    return typeof claim.claim !== 'string' || !claim.claim.trim() || !Array.isArray(claim.evidenceIds) || !claim.evidenceIds.length || claim.evidenceIds.some(id => typeof id !== 'string');
  })) return false;
  return claims.length > 0 || assessment.unknowns.some(value => typeof value === 'string' && value.trim());
}

export function normalizeEvidenceAnalysis(raw: unknown, evidence: ValidationEvidence[]) {
  const value = object(raw);
  const ai = object(value.aiAnalysis);
  const assessment = object(ai.evidenceAssessment);
  if (!hasAnalysisContract(ai, assessment)) return buildIncompleteAnalysis('模型返回的分析结构不完整，已保留证据，可继续分析。');
  const ids = new Set(evidence.map(item => item.id));
  const support = normalizeClaims(assessment.support, ids);
  const counter = normalizeClaims(assessment.counter, ids);
  const citedIds = new Set([...support, ...counter].flatMap(item => item.evidenceIds));
  const sources = new Set(evidence.filter(item => citedIds.has(item.id) && !item.sourceKey.includes(':unattributed:')).map(item => item.sourceKey));
  const requestedDecision = ai.decision as 'test' | 'reframe' | 'pause' | 'insufficient';
  const supportIds = new Set(support.flatMap(item => item.evidenceIds));
  const directDemandEvidence = evidence.some(item => supportIds.has(item.id) && isDirectDemandEvidence(item));
  const decision = support.length > 0 && directDemandEvidence && sources.size >= 2 ? requestedDecision : 'insufficient';
  const score = decision === 'insufficient' ? null : nullableScore(ai.feasibilityScore) ?? nullableScore(value.overallScore);
  const unknowns = strings(assessment.unknowns);
  if (sources.size < 2) unknowns.push('独立原始来源不足，帖子与其评论不重复计数。');
  if (!support.length) unknowns.push('尚无通过原文引用校验的需求支持主张。');
  if (support.length && !directDemandEvidence) unknowns.push('支持原文仅有竞品推广、广告或娱乐互动，尚不能证明用户需求。');
  const message = text(value.overallVerdict || ai.overallVerdict, 800) || '证据不足，尚不能作出需求成立或不存在的判断。';
  const market = object(value.marketAnalysis);
  const persona = object(value.persona);
  return {
    overallScore: score,
    overallVerdict: decision === 'insufficient' ? '证据不足，需补充独立来源或核实原文后再判断。' : message,
    marketAnalysis: { targetAudience: text(market.targetAudience) || null, marketSize: text(market.marketSize) || null, competitionLevel: text(market.competitionLevel) || null },
    sentimentAnalysis: classifiedSentiment(value.sentimentLabels, evidence),
    aiAnalysis: {
      feasibilityScore: score, overallVerdict: decision === 'insufficient' ? '证据不足，需补充独立来源或核实原文后再判断。' : message,
      analysisStatus: 'complete' as const, decision,
      strengths: strings(ai.strengths), weaknesses: strings(ai.weaknesses), risks: strings(ai.risks), suggestions: strings(ai.suggestions),
      monetizationStrategies: list(ai.monetizationStrategies).slice(0, 5), brandNames: list(ai.brandNames).slice(0, 5),
      evidenceAssessment: { support, counter, unknowns: [...new Set(unknowns)].slice(0, 10), nextExperiment: text(assessment.nextExperiment, 800) || '核实最大未知，询问目标用户最近一次真实经历。' },
    },
    persona: Object.keys(persona).length ? {
      name: text(persona.name, 120) || null, role: text(persona.role, 120) || null, age: text(persona.age, 80) || null, income: text(persona.income, 80) || null,
      painPoints: strings(persona.painPoints), goals: strings(persona.goals), behaviors: strings(persona.behaviors), channels: strings(persona.channels), description: text(persona.description) || null,
    } : null,
    dimensions: decision === 'insufficient' ? [] : list(value.dimensions).slice(0, 8).map(raw => {
      const dimension = object(raw);
      return { dimension: text(dimension.dimension, 80), score: nullableScore(dimension.score), reason: text(dimension.reason, 800) || null };
    }).filter(item => item.dimension && item.score !== null),
  };
}
