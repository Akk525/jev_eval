import type { DecisionProvider } from "../../providers/types.js";
import type { RouteDecision } from "../../types/routing.js";
import type { RouteInput, Router } from "../types.js";

/** Frozen Choice wording. An edit is a method change and needs a new version. */
export const JEV_ROUTER_INSTRUCTIONS_V1 = "v1: Select the one tool that should handle the task.";

const CHOICE_LIMIT = 255;

/** One Choice over routing summaries, then a local sort down to k. */
export function createJevRouter(provider: DecisionProvider): Router {
  return {
    id: "jev",
    async route(input: RouteInput): Promise<RouteDecision> {
      if (input.tools.length > CHOICE_LIMIT) {
        throw new Error(`jev choice supports at most ${CHOICE_LIMIT} tools`);
      }
      const criteria: Record<string, string> = {};
      for (const tool of input.tools) criteria[tool.name] = tool.routingSummary;

      const started = performance.now();
      const decision = await provider.decide({
        state: input.taskPrompt,
        instructions: JEV_ROUTER_INSTRUCTIONS_V1,
        criteria,
      });
      const ranked = Object.entries(decision.scores).sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      );

      return {
        candidates: ranked.slice(0, input.k).map(([name, score], index) => ({
          name,
          rank: index + 1,
          score,
        })),
        scores: decision.scores,
        top1Probability: decision.top1Probability,
        confidence: decision.confidence,
        usage: decision.usage,
        latencyMs: performance.now() - started,
        raw: decision.raw,
      };
    },
  };
}
