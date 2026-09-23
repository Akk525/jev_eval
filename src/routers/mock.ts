import type { RouteDecision } from "../types/routing.js";
import type { RouteInput, Router } from "./types.js";

/** Ranks a scripted tool first, then cuts to k. Scores stay null. */
export function createScriptedRouter(preferredByPrompt: ReadonlyMap<string, string>): Router {
  return {
    id: "mock",
    async route(input: RouteInput): Promise<RouteDecision> {
      const names = input.tools.map((tool) => tool.name);
      const preferred = preferredByPrompt.get(input.taskPrompt);
      const ordered = preferred !== undefined && names.includes(preferred)
        ? [preferred, ...names.filter((name) => name !== preferred)]
        : names;
      return {
        candidates: ordered.slice(0, input.k).map((name, index) => ({
          name,
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
