import type { RouteDecision } from "../../types/routing.js";
import type { RouteInput, Router } from "../types.js";

/** Presents every tool, in the given order. No model call and no cut to k. */
export function createBaselineRouter(): Router {
  return {
    id: "baseline",
    async route(input: RouteInput): Promise<RouteDecision> {
      return {
        candidates: input.tools.map((tool, index) => ({
          name: tool.name,
          rank: index + 1,
          score: null,
        })),
        scores: null,
        top1Probability: null,
        confidence: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
        raw: null,
      };
    },
  };
}
