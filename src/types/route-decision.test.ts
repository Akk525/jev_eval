import { expect, it } from "vitest";
import type { RouteDecision } from "./routing.js";

function unequalProbabilities(): RouteDecision {
  return {
    candidates: [
      { name: "search_files", rank: 1, score: 0.6 },
      { name: "search_email", rank: 2, score: 0.4 },
    ],
    scores: { search_files: 0.6, search_email: 0.4 },
    top1Probability: 0.6,
    confidence: 0.2,
    usage: { inputTokens: 12, outputTokens: 0 },
    latencyMs: 18,
    raw: { confidence: 0.2 },
  };
}

it("stores provider confidence separately from top-1 probability", () => {
  const decision = unequalProbabilities();
  expect(decision.confidence).toBe(0.2);
  expect(decision.top1Probability).toBe(0.6);
  expect(decision.confidence).not.toBe(decision.top1Probability);
  expect(decision.scores).toEqual({ search_files: 0.6, search_email: 0.4 });
});
