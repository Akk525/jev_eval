import type { TokenUsage } from "../../types/usage.js";
import type { RouteDecision } from "../../types/routing.js";
import type { RouteInput, Router } from "../types.js";

/** Frozen ranking wording. An edit is a method change and needs a new version. */
export const LLM_ROUTER_INSTRUCTIONS_V1 =
  "v1: Rank the tools that should handle the task. Reply with a JSON array of tool names only, best first. Use only the listed names.";

export interface RankRequest {
  prompt: string;
}

export interface RankResponse {
  text: string;
  usage: TokenUsage;
  raw: unknown;
}

export interface RankProvider {
  rank(request: RankRequest): Promise<RankResponse>;
}

export function buildLlmRouterPrompt(taskPrompt: string, criteria: Readonly<Record<string, string>>): string {
  const lines = Object.entries(criteria).map(([name, summary]) => `${name}: ${summary}`);
  return `${LLM_ROUTER_INSTRUCTIONS_V1}\n\nTask:\n${taskPrompt}\n\nTools:\n${lines.join("\n")}`;
}

/** Ranks routing summaries via one LLM call, then cuts at k. Throws on malformed output. */
export function createLlmRouter(provider: RankProvider): Router {
  return {
    id: "llm",
    async route(input: RouteInput): Promise<RouteDecision> {
      const criteria: Record<string, string> = {};
      for (const tool of input.tools) criteria[tool.name] = tool.routingSummary;
      const known = new Set(Object.keys(criteria));

      const started = performance.now();
      const ranked = await provider.rank({ prompt: buildLlmRouterPrompt(input.taskPrompt, criteria) });
      const names = parseRanking(ranked.text, known);

      return {
        candidates: names.slice(0, input.k).map((name, index) => ({
          name,
          rank: index + 1,
          score: null,
        })),
        scores: null,
        top1Probability: null,
        confidence: null,
        usage: ranked.usage,
        latencyMs: performance.now() - started,
        raw: ranked.raw,
      };
    },
  };
}

function parseRanking(text: string, known: ReadonlySet<string>): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (match === null) throw new Error("malformed llm ranking: expected a JSON array");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]) as unknown;
  } catch {
    throw new Error("malformed llm ranking: invalid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("malformed llm ranking: empty array");
  }
  const ordered: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") throw new Error("malformed llm ranking: non-string entry");
    if (!known.has(entry)) throw new Error(`malformed llm ranking: unknown tool ${entry}`);
    if (!ordered.includes(entry)) ordered.push(entry);
  }
  if (ordered.length === 0) throw new Error("malformed llm ranking: no known tools");
  return ordered;
}
