import type { ChatProvider } from "../providers/types.js";
import type { AgentTurn } from "../types/agent.js";
import type { Agent, AgentInput } from "./types.js";

export interface SingleStepAgentOptions {
  provider: ChatProvider;
  temperature: number;
}

/** One native tool-calling turn. The wording is the same for every architecture. */
export function buildAgentPrompt(taskPrompt: string): string {
  return `Call one tool to complete the task.\n\n${taskPrompt}`;
}

export function createSingleStepAgent(options: SingleStepAgentOptions): Agent {
  return {
    async run(input: AgentInput): Promise<AgentTurn> {
      const started = performance.now();
      const response = await options.provider.complete({
        prompt: buildAgentPrompt(input.taskPrompt),
        tools: input.tools,
        temperature: options.temperature,
      });
      return {
        selectedTool: response.selectedTool,
        arguments: response.arguments,
        finalResponse: response.finalResponse,
        usage: response.usage,
        latencyMs: performance.now() - started,
        raw: response.raw,
      };
    },
  };
}
