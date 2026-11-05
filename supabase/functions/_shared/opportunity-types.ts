// 商机雷达的共享类型。部署包只包含 supabase/functions，因此这里保持一份权威定义，
// 前端通过 src/types/opportunity.ts 再导出同一份内容，避免两边漂移。
export const RADAR_PLATFORMS = ['xiaohongshu', 'douyin', 'tiktok', 'instagram', 'youtube', 'reddit', 'twitter', 'threads'] as const;
export type RadarPlatform = typeof RADAR_PLATFORMS[number];

export interface OpportunityRequest {
  country: string;
  industry: string;
  keyword?: string;
  platforms: RadarPlatform[];
  mode: 'quick' | 'deep';
  language?: string;
  countryCode?: string;
  parentResearchId?: string;
  opportunityType?: 'reassurance' | 'ritual' | 'festival' | 'hobby' | 'daily' | 'workflow';
  valueModel?: 'utility' | 'entertainment';
}

export interface OpportunityEvidence {
  id: string;
  platform: string;
  title: string;
  snippet: string;
  url: string;
  collectedAt: string;
  kind: 'fact';
  publishedAt?: string;
  language?: string;
  signalType?: string;
}

export interface OpportunityCandidate {
  id: string;
  title: string;
  problem: string;
  targetUsers: string;
  urgency: 'high' | 'medium' | 'low';
  evidenceCount: number;
  competitionHint: string;
  recommendedNextStep: string;
  risks: string[];
  evidence: OpportunityEvidence[];
  kind: 'hypothesis';
  decision?: 'test' | 'reframe' | 'pause' | 'insufficient';
  support?: Array<{claim: string; evidenceIds: string[]}>;
  counter?: Array<{claim: string; evidenceIds: string[]}>;
  unknowns?: string[];
  mvp?: string;
  experiment?: string;
  paymentEvidence?: 'unknown' | 'pricing' | 'reported_purchase';
  localSearchTerms?: string;
}

export interface OpportunityResearchQuality {
  status: 'research_ready' | 'partial' | 'insufficient';
  independentSourceCount: number;
  sourceKindCount: number;
  localLanguageSourceCount: number;
  evidenceTypes: {
    experience: number;
    behavior: number;
    recurrence: number;
    payment: number;
    counter: number;
    sharing: number;
  };
  gaps: string[];
}

export interface OpportunityResult {
  schemaVersion: 1;
  fetchedAt: string;
  request: OpportunityRequest;
  candidates: OpportunityCandidate[];
  warnings: string[];
  stats: { sourceCount: number; postCount: number; commentCount: number; apiCalls: number; durationMs: number };
  queryPlan?: Array<{intent: string; query: string; language: string; platform?: string}>;
  signals?: Array<{id: string; evidenceIds: string[]; user: string; trigger: string; task: string; currentWorkaround: string; cost: string; recurrence: string; payment: string; type: 'experience'|'help'|'ritual'|'purchase'|'promotion'|'entertainment'; quote: string}>;
  quality?: OpportunityResearchQuality;
}
