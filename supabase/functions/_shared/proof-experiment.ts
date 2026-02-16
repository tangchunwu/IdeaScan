export type ExperimentEventType =
  | "view"
  | "cta_click"
  | "checkout_start"
  | "paid_intent"
  | "waitlist_submit";

export interface ProofCounters {
  uv_count: number;
  cta_click_count: number;
  checkout_start_count: number;
  paid_intent_count: number;
  waitlist_submit_count: number;
}

export interface ProofRates {
  paid_intent_rate: number;
  waitlist_rate: number;
  evidence_verdict: string;
}

export function computeProofRates(counters: ProofCounters): ProofRates {
  const uv = Math.max(0, Number(counters.uv_count || 0));
  const paidIntents = Math.max(0, Number(counters.paid_intent_count || 0));
  const waitlistSubmits = Math.max(0, Number(counters.waitlist_submit_count || 0));

  const paidIntentRate = uv > 0 ? paidIntents / uv : 0;
  const waitlistRate = uv > 0 ? waitlistSubmits / uv : 0;

  return {
    paid_intent_rate: Number(paidIntentRate.toFixed(6)),
    waitlist_rate: Number(waitlistRate.toFixed(6)),
    evidence_verdict: resolveProofVerdict(uv, paidIntentRate, waitlistRate),
  };
}

export function resolveProofVerdict(
  uvCount: number,
  paidIntentRate: number,
  waitlistRate: number
): string {
  if (uvCount < 50) return "insufficient_data";
  if (paidIntentRate >= 0.08) return "validated_paid_intent";
  if (paidIntentRate >= 0.04 || waitlistRate >= 0.12) return "promising_need";
  if (waitlistRate >= 0.06) return "needs_iteration";
  return "weak_signal";
}

