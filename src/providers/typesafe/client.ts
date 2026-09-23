import type { DecisionProvider, DecisionRequest, DecisionResponse } from "../types.js";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const UNPINNED = new Set(["jev-latest", "~typesafe/jev-latest"]);

export interface TypeSafeDecisionOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

/** Official System One Choice client. Does not call the network until `decide`. */
export function createTypeSafeDecisionProvider(options: TypeSafeDecisionOptions): DecisionProvider {
  if (UNPINNED.has(options.model)) throw new Error("jev model must be pinned");
  const fetchImpl = options.fetch ?? fetch;

  return {
    async decide(request: DecisionRequest): Promise<DecisionResponse> {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          state: request.state,
          questions: {
            tool: {
              type: "choice",
              instructions: request.instructions,
              criteria: request.criteria,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`system one request failed: ${response.status}`);
      return parseChoice(await response.json(), options.apiKey);
    },
  };
}

function parseChoice(body: unknown, apiKey: string): DecisionResponse {
  if (!isRecord(body)) throw new Error("malformed system one response");
  const answers = body.answers;
  if (!isRecord(answers) || !isRecord(answers.tool)) throw new Error("malformed system one response");
  const tool = answers.tool;
  if (tool.type !== "choice" || !isRecord(tool.probabilities)) throw new Error("malformed system one choice");
  const usage = body.usage;
  if (!isRecord(usage) || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    throw new Error("malformed system one usage");
  }

  const scores: Record<string, number> = {};
  for (const [name, value] of Object.entries(tool.probabilities)) {
    if (typeof value !== "number") throw new Error("malformed system one choice");
    scores[name] = value;
  }

  return {
    scores,
    top1Probability: typeof tool.probability === "number" ? tool.probability : null,
    confidence: typeof tool.confidence === "number" ? tool.confidence : null,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
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
