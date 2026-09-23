import type { TokenUsage } from "./usage.js";

export interface AgentTurn {
  selectedTool: string | null;
  arguments: Readonly<Record<string, unknown>>;
  finalResponse: string | null;
  usage: TokenUsage;
  latencyMs: number;
  raw: unknown;
}
