import { expect, it } from "vitest";
import { createOpenAIChatProvider } from "./client.js";

const apiKey = "sk-openai-secret";

it("posts one tool-calling turn and returns the selected tool", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({
        model: "gpt-5.6-sol",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search_email", arguments: '{"query":"quarterly"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 12 },
        note: apiKey,
      }),
      { status: 200 },
    );
  };

  const provider = createOpenAIChatProvider({ apiKey, model: "gpt-5.6-sol", fetch: fetchImpl });
  const turn = await provider.complete({
    prompt: "Call one tool to complete the task.\n\nFind the quarterly email",
    temperature: 0,
    tools: [
      {
        name: "search_email",
        description: "Search email",
        domain: "email",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        routingSummary: "Search emails",
        nearMisses: [],
      },
    ],
  });

  expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
  const headers = new Headers(calls[0]?.init.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${apiKey}`);
  const body = JSON.parse(String(calls[0]?.init.body)) as {
    model: string;
    temperature: number;
    reasoning_effort: string;
    tool_choice: string;
    parallel_tool_calls: boolean;
    tools: Array<{ type: string; function: { name: string; parameters: unknown } }>;
  };
  expect(body.model).toBe("gpt-5.6-sol");
  expect(body.temperature).toBe(0);
  expect(body.reasoning_effort).toBe("none");
  expect(body.tool_choice).toBe("required");
  expect(body.parallel_tool_calls).toBe(false);
  expect(body.tools).toEqual([
    {
      type: "function",
      function: {
        name: "search_email",
        description: "Search email",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
  ]);
  expect(turn.selectedTool).toBe("search_email");
  expect(turn.arguments).toEqual({ query: "quarterly" });
  expect(turn.usage).toEqual({ inputTokens: 40, outputTokens: 12 });
  expect(JSON.stringify(turn.raw)).not.toContain(apiKey);
});

it("returns a null tool when the model makes no call", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "done", tool_calls: [] } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      }),
      { status: 200 },
    );
  const turn = await createOpenAIChatProvider({ apiKey, model: "gpt-5.6-sol", fetch: fetchImpl }).complete({
    prompt: "task",
    temperature: 0,
    tools: [],
  });
  expect(turn.selectedTool).toBeNull();
  expect(turn.finalResponse).toBe("done");
});
