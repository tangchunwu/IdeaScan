export const RADAR_PLATFORMS = ['xiaohongshu', 'douyin', 'tiktok', 'instagram', 'youtube', 'reddit'] as const;
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
