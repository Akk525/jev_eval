import { expect, it } from "vitest";
import { createOpenAIRankProvider } from "../openai/rank.js";

const apiKey = "sk-rank-secret";

it("posts a text ranking request without tools", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: '["search_email","search_files"]' } }],
        usage: { prompt_tokens: 30, completion_tokens: 6 },
        note: apiKey,
      }),
      { status: 200 },
    );
  };

  const ranked = await createOpenAIRankProvider({
    apiKey,
    model: "gpt-5.6-sol",
    temperature: 0,
    fetch: fetchImpl,
  }).rank({ prompt: "rank these tools" });

  expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
  const body = JSON.parse(String(calls[0]?.init.body)) as {
    model: string;
    temperature: number;
    tools?: unknown;
    messages: Array<{ content: string }>;
  };
  expect(body.model).toBe("gpt-5.6-sol");
  expect(body.temperature).toBe(0);
  expect(body.tools).toBeUndefined();
  expect(body.messages[0]?.content).toBe("rank these tools");
  expect(ranked.text).toBe('["search_email","search_files"]');
  expect(ranked.usage).toEqual({ inputTokens: 30, outputTokens: 6 });
  expect(JSON.stringify(ranked.raw)).not.toContain(apiKey);
});
