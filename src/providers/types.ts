import type { ToolDefinition } from "../types/tool.js";
import type { TokenUsage } from "../types/usage.js";

export interface ChatRequest {
  prompt: string;
  tools: readonly ToolDefinition[];
}

export interface ChatResponse {
  selectedTool: string | null;
  arguments: Readonly<Record<string, unknown>>;
  finalResponse: string | null;
  usage: TokenUsage;
  raw: unknown;
}

export interface ChatProvider {
  complete(request: ChatRequest): Promise<ChatResponse>;
}

export interface DecisionRequest {
  state: string;
  criteria: Readonly<Record<string, string>>;
}

export interface DecisionResponse {
  scores: Readonly<Record<string, number>>;
  top1Probability: number | null;
  confidence: number | null;
  usage: TokenUsage;
  raw: unknown;
}

export interface DecisionProvider {
  decide(request: DecisionRequest): Promise<DecisionResponse>;
}
