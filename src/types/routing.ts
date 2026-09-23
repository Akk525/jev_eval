import type { TokenUsage } from "./usage.js";

export interface RouteCandidate {
  name: string;
  rank: number;
  /** Probability for this candidate, or null when the router has no distribution. */
  score: number | null;
}

/**
 * Routing outcome. `scores`, `top1Probability`, and `confidence` are independent.
 * Do not add a helper that derives one from another.
 */
export interface RouteDecision {
  candidates: readonly RouteCandidate[];
  /** Full distribution over the presented tools, or null if the router has none. */
  scores: Readonly<Record<string, number>> | null;
  /** Probability of the winning tool, copied from the provider. Null if absent. */
  top1Probability: number | null;
  /** Provider-reported confidence. Null if absent. Not max(scores). */
  confidence: number | null;
  usage: TokenUsage;
  latencyMs: number;
  raw: unknown;
}
