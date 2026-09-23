import type { AgentTurn } from "../types/agent.js";
import type { ToolDefinition } from "../types/tool.js";

export interface AgentInput {
  taskPrompt: string;
  tools: readonly ToolDefinition[];
}

export interface Agent {
  run(input: AgentInput): Promise<AgentTurn>;
}
