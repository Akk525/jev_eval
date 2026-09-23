import type { RankProvider, RankResponse } from "../../routers/llm/llm.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAIRankOptions {
  apiKey: string;
  model: string;
  temperature: number;
  fetch?: typeof fetch;
}

/** Text-only Chat Completions client for the LLM router. No tool schemas are sent. */
export function createOpenAIRankProvider(options: OpenAIRankOptions): RankProvider {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async rank(request): Promise<RankResponse> {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature,
          messages: [{ role: "user", content: request.prompt }],
        }),
      });
      if (!response.ok) throw new Error(`openai rank request failed: ${response.status}`);
      return parseRank(await response.json(), options.apiKey);
    },
  };
}

function parseRank(body: unknown, apiKey: string): RankResponse {
  if (!isRecord(body)) throw new Error("malformed openai rank response");
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("malformed openai rank choices");
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new Error("malformed openai rank message");
  const content = first.message.content;
  if (typeof content !== "string") throw new Error("malformed openai rank content");
  const usage = body.usage;
  if (!isRecord(usage) || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") {
    throw new Error("malformed openai rank usage");
  }
  return {
    text: content,
    usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
    raw: redact(body, apiKey),
  };
}

function redact(body: unknown, apiKey: string): unknown {
  if (apiKey === "") return body;
  return JSON.parse(JSON.stringify(body).replaceAll(apiKey, "[redacted]")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
