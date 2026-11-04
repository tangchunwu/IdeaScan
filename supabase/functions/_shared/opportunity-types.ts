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
}

export interface OpportunityEvidence {
  id: string;
  platform: string;
  title: string;
  snippet: string;
  url: string;
  collectedAt: string;
  kind: 'fact';
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
}

export interface OpportunityResult {
  schemaVersion: 1;
  fetchedAt: string;
  request: OpportunityRequest;
  candidates: OpportunityCandidate[];
  warnings: string[];
  stats: { sourceCount: number; postCount: number; commentCount: number; apiCalls: number; durationMs: number };
}
