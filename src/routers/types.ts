import type { RouteDecision } from "../types/routing.js";
import type { ToolDefinition } from "../types/tool.js";

export interface RouteInput {
  taskPrompt: string;
  tools: readonly ToolDefinition[];
  k: number;
}

export interface Router {
  readonly id: "baseline" | "jev" | "llm" | "mock";
  route(input: RouteInput): Promise<RouteDecision>;
}
