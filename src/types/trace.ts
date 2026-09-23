import type { AgentTurn } from "./agent.js";
import type { RouteDecision } from "./routing.js";
import type { ToolExecutionResult } from "./tool.js";

export type FailureCode = "R0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export type InfrastructureReason = "provider_error" | "malformed_decision";

export type TraceEvent =
  | {
      type: "task_started";
      taskId: string;
      repetition: number;
      toolspace: readonly string[];
    }
  | { type: "routing_completed"; decision: RouteDecision }
  | { type: "agent_completed"; turn: AgentTurn }
  | { type: "tool_completed"; result: ToolExecutionResult }
  | {
      type: "evaluation_completed";
      executionSuccess: boolean;
      failureCode: FailureCode | null;
      infrastructureReason: InfrastructureReason | null;
    }
  | { type: "run_failed"; message: string };
