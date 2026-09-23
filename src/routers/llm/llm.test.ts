import { expect, it } from "vitest";
import type { ToolDefinition } from "../../types/tool.js";
import {
  LLM_ROUTER_INSTRUCTIONS_V1,
  buildLlmRouterPrompt,
  createLlmRouter,
  type RankProvider,
} from "./llm.js";

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

it("returns a scripted ranking cut at k without sending full schemas", async () => {
  const prompts: string[] = [];
  const provider: RankProvider = {
    async rank(request) {
      prompts.push(request.prompt);
      return {
        text: '["search_email", "search_files", "other"]',
        usage: { inputTokens: 20, outputTokens: 8 },
        raw: { ok: true },
      };
    },
  };

  const decision = await createLlmRouter(provider).route({
    taskPrompt: "Find Sarah's quarterly email",
    tools,
    k: 2,
  });

  expect(decision.candidates.map((candidate) => candidate.name)).toEqual(["search_email", "search_files"]);
  expect(decision.candidates.map((candidate) => candidate.rank)).toEqual([1, 2]);
  expect(decision.scores).toBeNull();
  expect(decision.top1Probability).toBeNull();
  expect(decision.confidence).toBeNull();
  expect(decision.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  expect(prompts[0]).toContain(LLM_ROUTER_INSTRUCTIONS_V1);
  expect(prompts[0]).toContain("Find Sarah's quarterly email");
  expect(prompts[0]).toContain("Search emails by sender or subject.");
  expect(prompts[0]).not.toContain("Full schema description");
  expect(prompts[0]).not.toContain("parameters");
  expect(buildLlmRouterPrompt("task", { search_email: "mail" })).toContain("search_email: mail");
});

it("throws on malformed ranking output instead of expanding to the full toolspace", async () => {
  const provider: RankProvider = {
    async rank() {
      return {
        text: "I would use search_email I think",
        usage: { inputTokens: 5, outputTokens: 4 },
        raw: null,
      };
    },
  };
  await expect(
    createLlmRouter(provider).route({ taskPrompt: "task", tools, k: 2 }),
  ).rejects.toThrow(/malformed/);
});
