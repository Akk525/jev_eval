import { expect, it } from "vitest";
import type { DecisionProvider, DecisionRequest } from "../../providers/types.js";
import type { ToolDefinition } from "../../types/tool.js";
import { JEV_ROUTER_INSTRUCTIONS_V1, createJevRouter } from "./jev.js";

function tool(name: string, routingSummary: string): ToolDefinition {
  return {
    name,
    description: `Full schema description for ${name}.`,
    domain: "email",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    routingSummary,
    nearMisses: [],
  };
}

const tools = [
  tool("search_email", "Search emails by sender or subject."),
  tool("search_files", "Search files by name or content."),
  tool("other", "Some other tool."),
];

it("sorts one Choice distribution and cuts at k without dropping the full scores", async () => {
  const requests: DecisionRequest[] = [];
  const provider: DecisionProvider = {
    async decide(request) {
      requests.push(request);
      return {
        scores: { search_email: 0.5, search_files: 0.4, other: 0.1 },
        top1Probability: 0.5,
        confidence: 0.2,
        usage: { inputTokens: 12, outputTokens: 3 },
        raw: { ok: true },
      };
    },
  };

  const decision = await createJevRouter(provider).route({
    taskPrompt: "Find Sarah's quarterly email",
    tools,
    k: 2,
  });

  expect(decision.candidates.map((candidate) => candidate.name)).toEqual(["search_email", "search_files"]);
  expect(decision.candidates.map((candidate) => candidate.score)).toEqual([0.5, 0.4]);
  expect(decision.scores).toEqual({ search_email: 0.5, search_files: 0.4, other: 0.1 });
  expect(decision.confidence).toBe(0.2);
  expect(decision.top1Probability).toBe(0.5);
  expect(decision.confidence).not.toBe(decision.top1Probability);
  expect(requests[0]?.state).toBe("Find Sarah's quarterly email");
  expect(requests[0]?.instructions).toBe(JEV_ROUTER_INSTRUCTIONS_V1);
  expect(requests[0]?.criteria).toEqual({
    search_email: "Search emails by sender or subject.",
    search_files: "Search files by name or content.",
    other: "Some other tool.",
  });
  expect(JSON.stringify(requests[0])).not.toContain("Full schema description");
  expect(JSON.stringify(requests[0])).not.toContain("parameters");
});

it("rejects more than 255 tools before calling the provider", async () => {
  let calls = 0;
  const provider: DecisionProvider = {
    async decide() {
      calls += 1;
      throw new Error("decide should not run");
    },
  };
  const many = Array.from({ length: 256 }, (_, index) => tool(`tool_${index}`, `summary ${index}`));
  await expect(createJevRouter(provider).route({ taskPrompt: "task", tools: many, k: 1 })).rejects.toThrow(/255/);
  expect(calls).toBe(0);
});
