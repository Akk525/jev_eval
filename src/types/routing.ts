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
  /** Present when the adaptive router selected a policy branch (#43). */
  adaptive?: AdaptiveRouteMeta;
}

export interface AdaptiveRouteMeta {
  policyVersion: string;
  branch: "high" | "medium" | "low";
  selectedK: number;
  /** Null when the branch stayed on Jev. */
  escalationTarget: "llm_topk" | null;
  jevConfidence: number | null;
  jevTop1Probability: number | null;
  jevUsage: TokenUsage;
  jevLatencyMs: number;
  escalateUsage: TokenUsage;
  escalateLatencyMs: number;
}
