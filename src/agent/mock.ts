import type { AgentTurn } from "../types/agent.js";
import type { Agent, AgentInput } from "./types.js";

export interface ScriptedCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export function createScriptedAgent(callsByPrompt: ReadonlyMap<string, ScriptedCall>): Agent {
  return {
    async run(input: AgentInput): Promise<AgentTurn> {
      const scripted = callsByPrompt.get(input.taskPrompt);
      const available = new Set(input.tools.map((tool) => tool.name));
      const selected = scripted !== undefined && available.has(scripted.tool) ? scripted.tool : null;
      return {
        selectedTool: selected,
        arguments: selected === null || scripted === undefined ? {} : scripted.arguments,
        finalResponse: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
        raw: null,
      };
    },
  };
}
