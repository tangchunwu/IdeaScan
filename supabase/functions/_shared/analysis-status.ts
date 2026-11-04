export type AnalysisStatus = 'complete' | 'incomplete' | 'legacy' | 'unknown';
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

export function resolveAnalysisStatus(aiAnalysis: unknown, dataSummary: unknown): AnalysisStatus {
  const ai = record(aiAnalysis);
  const summary = record(dataSummary);
  const value = ai.analysisStatus ?? summary.analysisStatus;
  if (value === 'complete') return 'complete';
  if (value === 'incomplete') return 'incomplete';
  if (aiAnalysis || dataSummary) return 'legacy';
  return 'unknown';
}

export function resolveDecision(aiAnalysis: unknown): string {
  const decision = record(aiAnalysis).decision;
  return typeof decision === 'string' ? decision : '';
}

export function isDecisionReady(aiAnalysis: unknown, dataSummary: unknown): boolean {
  return resolveAnalysisStatus(aiAnalysis, dataSummary) === 'complete' && resolveDecision(aiAnalysis) !== 'insufficient';
}

export function usableResearchScore(score: unknown, aiAnalysis: unknown, dataSummary: unknown): number | null {
  if (!isDecisionReady(aiAnalysis, dataSummary)) return null;
  return typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}
