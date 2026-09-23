import { expect, it } from "vitest";
import { createMockChatProvider } from "../providers/mock/providers.js";
import type { ChatProvider, ChatRequest, ChatResponse } from "../providers/types.js";
import { createCatalogRegistry } from "../tools/catalog.js";
import { createSingleStepAgent } from "./single-step.js";

const tools = createCatalogRegistry()
  .list()
  .filter((tool) => tool.name === "search_email" || tool.name === "read_file");

function capturing(script: readonly ChatResponse[]): { provider: ChatProvider; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const inner = createMockChatProvider(script);
  return {
    requests,
    provider: {
      async complete(request) {
        requests.push(request);
        return inner.complete(request);
      },
    },
  };
}

it("returns a scripted search_email call and sends only the given tools", async () => {
  const { provider, requests } = capturing([
    {
      selectedTool: "search_email",
      arguments: { query: "quarterly" },
      finalResponse: null,
      usage: { inputTokens: 11, outputTokens: 4 },
      raw: null,
    },
  ]);
  const turn = await createSingleStepAgent({ provider, temperature: 0 }).run({
    taskPrompt: "Find Sarah's quarterly email",
    tools,
  });

  expect(turn.selectedTool).toBe("search_email");
  expect(turn.arguments).toEqual({ query: "quarterly" });
  expect(turn.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
  expect(turn.latencyMs).toBeGreaterThanOrEqual(0);
  expect(requests[0]?.tools).toEqual(tools);
  expect(requests[0]?.tools[0]?.parameters).toEqual(tools[0]?.parameters);
  expect(requests[0]?.temperature).toBe(0);
  expect(requests[0]?.prompt.toLowerCase()).not.toMatch(/jev|baseline|router/);
});

it("returns a null tool when the provider makes no call", async () => {
  const { provider } = capturing([
    {
      selectedTool: null,
      arguments: {},
      finalResponse: null,
      usage: { inputTokens: 5, outputTokens: 1 },
      raw: null,
    },
  ]);
  const turn = await createSingleStepAgent({ provider, temperature: 0 }).run({
    taskPrompt: "Find Sarah's quarterly email",
    tools,
  });
  expect(turn.selectedTool).toBeNull();
});
