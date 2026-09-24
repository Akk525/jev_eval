import type { ChatProvider, ChatRequest, ChatResponse } from "../types.js";
import type { JsonSchema } from "../../types/json-schema.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAIChatOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

/** Native tool-calling Chat Completions client. Does not call the network until `complete`. */
export function createOpenAIChatProvider(options: OpenAIChatOptions): ChatProvider {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async complete(request: ChatRequest): Promise<ChatResponse> {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          temperature: request.temperature,
          messages: [{ role: "user", content: request.prompt }],
          tools: request.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters as JsonSchema,
            },
          })),
          tool_choice: "required",
          parallel_tool_calls: false,
        }),
      });
      if (!response.ok) {
        const detail = response.status === 429 ? " (rate limit or quota — wait or check OpenAI billing)" : "";
        throw new Error(`openai chat request failed: ${response.status}${detail}`);
      }
      return parseChat(await response.json(), options.apiKey);
    },
  };
}

function parseChat(body: unknown, apiKey: string): ChatResponse {
  if (!isRecord(body)) throw new Error("malformed openai response");
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("malformed openai choices");
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new Error("malformed openai message");
  const message = first.message;
  const usage = body.usage;
  if (!isRecord(usage) || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") {
    throw new Error("malformed openai usage");
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const call = toolCalls[0];
  let selectedTool: string | null = null;
  let args: Record<string, unknown> = {};
  if (isRecord(call) && isRecord(call.function) && typeof call.function.name === "string") {
    selectedTool = call.function.name;
    args = parseArguments(call.function.arguments);
  }

  return {
    selectedTool,
    arguments: args,
    finalResponse: typeof message.content === "string" ? message.content : null,
    usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
    raw: redact(body, apiKey),
  };
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    throw new Error("malformed openai tool arguments");
  }
}

function redact(body: unknown, apiKey: string): unknown {
  if (apiKey === "") return body;
  return JSON.parse(JSON.stringify(body).replaceAll(apiKey, "[redacted]")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
