import { canonicalJson } from "../../canonical.js";
import type { AgentTurn } from "../../types/agent.js";
import type { RouteDecision } from "../../types/routing.js";
import type { ToolExecutionResult } from "../../types/tool.js";
import type { FailureCode, InfrastructureReason } from "../../types/trace.js";

export interface AttemptRecord {
  requiredTools: readonly string[];
  acceptableTools: readonly string[];
  expectedArguments?: Readonly<Record<string, unknown>>;
  /** When true, score routing only. Execution stays excluded. */
  routerOnly?: boolean;
  router:
    | { status: "valid"; decision: RouteDecision }
    | { status: "failed"; reason: InfrastructureReason };
  agent:
    | { status: "valid"; turn: AgentTurn }
    | { status: "failed"; reason: InfrastructureReason }
    | { status: "not_run" };
  tool:
    | { status: "result"; result: ToolExecutionResult }
    | { status: "threw"; message: string }
    | { status: "not_run" };
}

export interface FailureClassification {
  /** Null is execution success. R5 is never returned. */
  code: FailureCode | null;
  infrastructureReason: InfrastructureReason | null;
  executionExcluded: boolean;
  routingExcluded: boolean;
  executionSuccess: boolean;
}

const SUCCESS: FailureClassification = {
  code: null,
  infrastructureReason: null,
  executionExcluded: false,
  routingExcluded: false,
  executionSuccess: true,
};

export function classifyAttempt(record: AttemptRecord): FailureClassification {
  if (record.router.status === "failed") {
    return infrastructure(record.router.reason, true);
  }

  if (record.routerOnly === true) {
    return classifyRouterOnly(record.requiredTools, record.router.decision);
  }

  if (record.agent.status === "failed") {
    return infrastructure(record.agent.reason, false);
  }

  if (record.tool.status === "threw") {
    return infrastructure("provider_error", false);
  }

  if (succeeded(record)) return SUCCESS;

  const candidates = record.router.decision.candidates.map((candidate) => candidate.name);
  const requiredMissing = record.requiredTools.some((tool) => !candidates.includes(tool));
  if (requiredMissing) return scientific("R1");

  const selected = record.agent.status === "valid" ? record.agent.turn.selectedTool : null;
  const gold = new Set([...record.requiredTools, ...record.acceptableTools]);
  if (selected === null || !gold.has(selected)) return scientific("R2");

  if (!argumentsMatch(record)) return scientific("R3");

  if (record.tool.status === "result" && !record.tool.result.success) return scientific("R4");

  return infrastructure("provider_error", false);
}

/** Router-only runs never enter the Execution Success Rate denominator. */
function classifyRouterOnly(
  requiredTools: readonly string[],
  decision: RouteDecision,
): FailureClassification {
  const candidates = decision.candidates.map((candidate) => candidate.name);
  const requiredMissing = requiredTools.some((tool) => !candidates.includes(tool));
  return {
    code: requiredMissing ? "R1" : null,
    infrastructureReason: null,
    executionExcluded: true,
    routingExcluded: false,
    executionSuccess: false,
  };
}

function succeeded(record: AttemptRecord): boolean {
  if (record.agent.status !== "valid" || record.tool.status !== "result") return false;
  if (!record.tool.result.success) return false;
  const selected = record.agent.turn.selectedTool;
  if (selected === null) return false;
  const gold = new Set([...record.requiredTools, ...record.acceptableTools]);
  if (!gold.has(selected)) return false;
  return argumentsMatch(record);
}

function argumentsMatch(record: AttemptRecord): boolean {
  if (record.expectedArguments === undefined) return true;
  if (record.agent.status !== "valid") return false;
  const actual = record.agent.turn.arguments;
  return Object.entries(record.expectedArguments).every(
    ([key, value]) => canonicalJson(actual[key]) === canonicalJson(value),
  );
}

function infrastructure(reason: InfrastructureReason, routingExcluded: boolean): FailureClassification {
  return {
    code: "R0",
    infrastructureReason: reason,
    executionExcluded: true,
    routingExcluded,
    executionSuccess: false,
  };
}

function scientific(code: "R1" | "R2" | "R3" | "R4"): FailureClassification {
  return {
    code,
    infrastructureReason: null,
    executionExcluded: false,
    routingExcluded: false,
    executionSuccess: false,
  };
}
