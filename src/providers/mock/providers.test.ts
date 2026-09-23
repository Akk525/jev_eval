import { expect, it } from "vitest";
import { createMockChatProvider, createMockDecisionProvider } from "./providers.js";

const decision = {
  scores: { search_email: 0.5, search_files: 0.5 },
  top1Probability: 0.5,
  confidence: 0.1,
  usage: { inputTokens: 3, outputTokens: 1 },
  raw: null,
};

it("replays a decision script deterministically", async () => {
  const provider = createMockDecisionProvider([decision, decision]);
  const first = await provider.decide({ state: "one", instructions: "v1", criteria: { search_email: "mail" } });
  const second = await provider.decide({ state: "two", instructions: "v1", criteria: { search_email: "mail" } });
  expect(first).toEqual(second);
  expect(first.confidence).not.toBe(first.top1Probability);
  expect(first.usage).toEqual({ inputTokens: 3, outputTokens: 1 });
});

it("replays a scripted tool call", async () => {
  const provider = createMockChatProvider([
    {
      selectedTool: "search_email",
      arguments: { query: "sarah" },
      finalResponse: null,
      usage: { inputTokens: 8, outputTokens: 2 },
      raw: null,
    },
  ]);
  const turn = await provider.complete({ prompt: "Find Sarah's email", tools: [], temperature: 0 });
  expect(turn.selectedTool).toBe("search_email");
  expect(turn.arguments).toEqual({ query: "sarah" });
  expect(turn.usage.outputTokens).toBe(2);
});
