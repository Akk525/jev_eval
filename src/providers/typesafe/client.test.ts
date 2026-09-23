import { expect, it } from "vitest";
import { createTypeSafeDecisionProvider } from "./client.js";

const apiKey = "secret-key";

it("posts one Choice and keeps probability, confidence, and the key apart", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const body = {
      model: "jev-1.13.0",
      answers: {
        tool: {
          type: "choice",
          choice: "search_email",
          probability: 0.41,
          probabilities: { search_email: 0.5, search_files: 0.4 },
          confidence: 0.2,
        },
      },
      usage: { input_tokens: 12, output_tokens: 3 },
      note: apiKey,
    };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  const provider = createTypeSafeDecisionProvider({ apiKey, model: "jev-1.13.0", fetch: fetchImpl });
  const decision = await provider.decide({
    state: "Find the report",
    instructions: "v1: Select the one tool that should handle the task.",
    criteria: { search_email: "Search emails by sender or subject." },
  });

  expect(calls[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
  const headers = new Headers(calls[0]?.init.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${apiKey}`);
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
    model: "jev-1.13.0",
    state: "Find the report",
    questions: {
      tool: {
        type: "choice",
        instructions: "v1: Select the one tool that should handle the task.",
        criteria: { search_email: "Search emails by sender or subject." },
      },
    },
  });
  expect(decision.scores).toEqual({ search_email: 0.5, search_files: 0.4 });
  expect(decision.top1Probability).toBe(0.41);
  expect(decision.confidence).toBe(0.2);
  expect(decision.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  expect(JSON.stringify(decision.raw)).not.toContain(apiKey);
});

it("rejects an unpinned Jev model", () => {
  expect(() => createTypeSafeDecisionProvider({ apiKey, model: "jev-latest", fetch })).toThrow(/pinned/);
});
