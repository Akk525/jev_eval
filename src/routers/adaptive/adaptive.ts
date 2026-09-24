import type { RouteDecision } from "../../types/routing.js";
import type { TokenUsage } from "../../types/usage.js";
import type { RouteInput, Router } from "../types.js";
import { branchForConfidence, type AdaptivePolicy } from "./policy.js";

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export interface AdaptiveRouterOptions {
  policy: AdaptivePolicy;
  /** Primary Jev router. Always invoked once per task. */
  jev: Router;
  /** Escalation target for the low branch (LLM top-k). */
  escalate: Router;
}

/**
 * Adaptive router: Jev confidence selects branch/k; low confidence escalates to LLM.
 * Never uses top1Probability for branching (D4). Escalation failures propagate (R0).
 */
export function createAdaptiveRouter(options: AdaptiveRouterOptions): Router {
  return {
    id: "adaptive",
    async route(input: RouteInput): Promise<RouteDecision> {
      const probeK = Math.max(input.k, maxJevK(options.policy), input.tools.length);
      const jevDecision = await options.jev.route({ ...input, k: probeK });
      if (jevDecision.confidence === null || jevDecision.confidence === undefined) {
        throw new Error("adaptive router requires non-null Jev confidence");
      }

      const branch = branchForConfidence(jevDecision.confidence, options.policy);
      const policyVersion = options.policy.version;

      if (branch.action.type === "jev_topk") {
        const selectedK = branch.action.k;
        const candidates = sliceCandidates(jevDecision, selectedK);
        return {
          candidates,
          scores: jevDecision.scores,
          top1Probability: jevDecision.top1Probability,
          confidence: jevDecision.confidence,
          usage: jevDecision.usage,
          latencyMs: jevDecision.latencyMs,
          raw: {
            jev: jevDecision.raw,
            adaptive: { branch: branch.id, selectedK, escalationTarget: null },
          },
          adaptive: {
            policyVersion,
            branch: branch.id,
            selectedK,
            escalationTarget: null,
            jevConfidence: jevDecision.confidence,
            jevTop1Probability: jevDecision.top1Probability,
            jevUsage: jevDecision.usage,
            jevLatencyMs: jevDecision.latencyMs,
            escalateUsage: ZERO_USAGE,
            escalateLatencyMs: 0,
          },
        };
      }

      const selectedK = branch.action.k;
      const escalateStarted = performance.now();
      let escalateDecision: RouteDecision;
      try {
        escalateDecision = await options.escalate.route({ ...input, k: selectedK });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`adaptive escalate failed: ${message}`);
      }
      const escalateLatencyMs =
        escalateDecision.latencyMs > 0
          ? escalateDecision.latencyMs
          : performance.now() - escalateStarted;

      return {
        candidates: escalateDecision.candidates.slice(0, selectedK),
        // Keep Jev distribution for calibration; candidates come from the escalate router.
        scores: jevDecision.scores,
        top1Probability: jevDecision.top1Probability,
        confidence: jevDecision.confidence,
        usage: addUsage(jevDecision.usage, escalateDecision.usage),
        latencyMs: jevDecision.latencyMs + escalateLatencyMs,
        raw: {
          jev: jevDecision.raw,
          escalate: escalateDecision.raw,
          adaptive: { branch: branch.id, selectedK, escalationTarget: branch.action.target },
        },
        adaptive: {
          policyVersion,
          branch: branch.id,
          selectedK,
          escalationTarget: branch.action.target,
          jevConfidence: jevDecision.confidence,
          jevTop1Probability: jevDecision.top1Probability,
          jevUsage: jevDecision.usage,
          jevLatencyMs: jevDecision.latencyMs,
          escalateUsage: escalateDecision.usage,
          escalateLatencyMs,
        },
      };
    },
  };
}

function maxJevK(policy: AdaptivePolicy): number {
  let max = 1;
  for (const branch of policy.branches) {
    if (branch.action.type === "jev_topk") max = Math.max(max, branch.action.k);
  }
  return max;
}

function sliceCandidates(decision: RouteDecision, k: number): RouteDecision["candidates"] {
  if (decision.scores) {
    const ranked = Object.entries(decision.scores).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );
    return ranked.slice(0, k).map(([name, score], index) => ({
      name,
      rank: index + 1,
      score,
    }));
  }
  return decision.candidates.slice(0, k).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}
