export type EvidenceGrade = "A" | "B" | "C" | "D";

export interface CostBreakdown {
  llm_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  external_api_calls: number;
  est_cost: number;
  model?: string;
  latency_ms?: number;
}

export interface ProofResult {
  paid_intent_rate: number;
  waitlist_rate: number;
  sample_uv: number;
  verdict: string;
}

export function calculateEvidenceGrade(params: {
  dataQualityScore: number;
  sampleCount: number;
  commentCount: number;
  competitorCount: number;
}): EvidenceGrade {
  const { dataQualityScore, sampleCount, commentCount, competitorCount } = params;

  if (dataQualityScore >= 80 && sampleCount >= 80 && commentCount >= 20 && competitorCount >= 8) {
    return "A";
  }
  if (dataQualityScore >= 60 && sampleCount >= 40 && commentCount >= 10 && competitorCount >= 5) {
    return "B";
  }
  if (dataQualityScore >= 35 && sampleCount >= 15 && competitorCount >= 2) {
    return "C";
  }
  return "D";
}

export function estimateCostBreakdown(params: {
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  externalApiCalls: number;
  model?: string;
  latencyMs?: number;
}): CostBreakdown {
  const {
    llmCalls,
    promptTokens,
    completionTokens,
    externalApiCalls,
    model,
    latencyMs,
  } = params;

  // Conservative blended estimate (USD/token) for mixed providers/models.
  const promptTokenRate = 0.00000035;
  const completionTokenRate = 0.0000012;
  const externalCallRate = 0.0004;

  const estCost = Number(
    (
      promptTokens * promptTokenRate +
      completionTokens * completionTokenRate +
      externalApiCalls * externalCallRate
    ).toFixed(6)
  );

  return {
    llm_calls: llmCalls,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    external_api_calls: externalApiCalls,
    est_cost: estCost,
    model,
    latency_ms: latencyMs,
  };
}

export function createDefaultProofResult(): ProofResult {
  return {
    paid_intent_rate: 0,
    waitlist_rate: 0,
    sample_uv: 0,
    verdict: "pending_experiment",
  };
}

