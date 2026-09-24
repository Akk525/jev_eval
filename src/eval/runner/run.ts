import { readFileSync } from "node:fs";
import type { Agent } from "../../agent/types.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import { evaluateAttempt, type AttemptEvaluation } from "../evaluators/attempt.js";
import { pricedCostUsd } from "../../metrics/metrics.js";
import type { PricingTable } from "../../pricing/load.js";
import { requireModelPrice } from "../../pricing/load.js";
import type { Router } from "../../routers/types.js";
import type { OpenResultDirectory, ResultSummary, RunRecord } from "../../results/writer.js";
import { toolspaceForTask } from "../../tools/toolspace.js";
import type { ExperimentConfig } from "../../types/config.js";
import type { RouteDecision } from "../../types/routing.js";
import type { Tracer, TraceHandle } from "../../tracing/tracer.js";
import type { ToolDefinition } from "../../types/tool.js";
import type { ToolFixture, ToolRegistry } from "../../tools/registry/registry.js";
import type { TokenUsage } from "../../types/usage.js";
import { AsyncMutex, mapPool } from "./pool.js";

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export interface ExperimentRun {
  config: ExperimentConfig;
  tasks: readonly BenchmarkTask[];
  registry: ToolRegistry;
  router: Router;
  agent: Agent;
  tracer: Tracer;
  results: OpenResultDirectory;
  /** Null skips pricing (smoke/mock). Live architectures load the config's pricing version. */
  pricing: PricingTable | null;
  /** Fixture passed to tool executors. Defaults to {}. */
  fixture?: ToolFixture;
}

interface AttemptWork {
  task: BenchmarkTask;
  repetition: number;
  toolspace: readonly string[];
  presented: ToolDefinition[];
}

export async function runExperiment(run: ExperimentRun): Promise<ResultSummary> {
  const tools = run.registry.list();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const k = run.config.topK ?? tools.length;
  const handle = await run.tracer.startRun({ runId: run.results.directory });
  const writeLock = new AsyncMutex();

  const work: AttemptWork[] = [];
  for (const task of run.tasks) {
    for (let repetition = 0; repetition < run.config.repetitions; repetition += 1) {
      if (run.results.completedKey(task.id, repetition)) continue;
      const toolspace = toolspaceForTask(task.required_tools, tools, run.registry.tail, run.config.toolspaceSize);
      if (toolspace === null) continue;
      const presented = toolspace.map((name) => {
        const tool = byName.get(name);
        if (!tool) throw new Error(`toolspace named a missing tool: ${name}`);
        return tool;
      });
      work.push({ task, repetition, toolspace, presented });
    }
  }

  try {
    await mapPool(work, run.config.concurrency, async (item) => {
      await processAttempt(run, handle, writeLock, item, k);
    });
    await run.tracer.endRun(handle, "completed");
  } catch (error) {
    await run.tracer.endRun(handle, "failed");
    throw error;
  }

  return JSON.parse(readFileSync(`${run.results.directory}/summary.json`, "utf8")) as ResultSummary;
}

async function processAttempt(
  run: ExperimentRun,
  handle: TraceHandle,
  writeLock: AsyncMutex,
  item: AttemptWork,
  k: number,
): Promise<void> {
  const { task, repetition, toolspace, presented } = item;

  await run.tracer.event(handle, {
    type: "task_started",
    taskId: task.id,
    repetition,
    toolspace,
  });

  const attemptBase = {
    requiredTools: task.required_tools,
    acceptableTools: task.acceptable_tools,
    ...(task.expected_arguments === undefined ? {} : { expectedArguments: task.expected_arguments }),
    ...(run.config.routerOnly ? { routerOnly: true as const } : {}),
  };

  let decision: RouteDecision;
  try {
    decision = await run.router.route({ taskPrompt: task.prompt, tools: presented, k });
  } catch {
    await finish(
      run,
      handle,
      writeLock,
      task,
      repetition,
      toolspace,
      evaluateAttempt(
        {
          ...attemptBase,
          router: { status: "failed", reason: "provider_error" },
          agent: { status: "not_run" },
          tool: { status: "not_run" },
        },
        k,
      ),
      null,
      ZERO_USAGE,
      null,
    );
    return;
  }
  await run.tracer.event(handle, { type: "routing_completed", decision });
  const scoreK = decision.adaptive?.selectedK ?? k;

  if (run.config.routerOnly) {
    await finish(
      run,
      handle,
      writeLock,
      task,
      repetition,
      toolspace,
      evaluateAttempt(
        {
          ...attemptBase,
          router: { status: "valid", decision },
          agent: { status: "not_run" },
          tool: { status: "not_run" },
        },
        scoreK,
      ),
      decision,
      ZERO_USAGE,
      null,
    );
    return;
  }

  const candidateNames = new Set(decision.candidates.map((candidate) => candidate.name));
  const candidates = presented.filter((tool) => candidateNames.has(tool.name));
  let turn;
  try {
    turn = await run.agent.run({ taskPrompt: task.prompt, tools: candidates });
  } catch {
    await finish(
      run,
      handle,
      writeLock,
      task,
      repetition,
      toolspace,
      evaluateAttempt(
        {
          ...attemptBase,
          router: { status: "valid", decision },
          agent: { status: "failed", reason: "provider_error" },
          tool: { status: "not_run" },
        },
        scoreK,
      ),
      decision,
      ZERO_USAGE,
      null,
    );
    return;
  }
  await run.tracer.event(handle, { type: "agent_completed", turn });

  const toolResult =
    turn.selectedTool === null
      ? null
      : run.registry.execute(turn.selectedTool, turn.arguments, run.fixture ?? {});
  if (toolResult) await run.tracer.event(handle, { type: "tool_completed", result: toolResult });

  await finish(
    run,
    handle,
    writeLock,
    task,
    repetition,
    toolspace,
    evaluateAttempt(
      {
        ...attemptBase,
        router: { status: "valid", decision },
        agent: { status: "valid", turn },
        tool: toolResult === null ? { status: "not_run" } : { status: "result", result: toolResult },
      },
      scoreK,
    ),
    decision,
    turn.usage,
    turn.latencyMs,
  );
}

export function attemptPricedCostUsd(
  pricing: PricingTable | null,
  config: ExperimentConfig,
  routerUsage: TokenUsage,
  agentUsage: TokenUsage,
  decision: RouteDecision | null = null,
): number {
  if (pricing === null) return 0;
  let total = pricedCostUsd(
    agentUsage,
    requireModelPrice(pricing, config.agent.provider, config.agent.model),
  );
  if (config.architecture === "adaptive" && decision?.adaptive && config.router && config.escalateRouter) {
    total += pricedCostUsd(
      decision.adaptive.jevUsage,
      requireModelPrice(pricing, config.router.provider, config.router.model),
    );
    total += pricedCostUsd(
      decision.adaptive.escalateUsage,
      requireModelPrice(pricing, config.escalateRouter.provider, config.escalateRouter.model),
    );
    return total;
  }
  if (config.router !== null) {
    total += pricedCostUsd(
      routerUsage,
      requireModelPrice(pricing, config.router.provider, config.router.model),
    );
  }
  return total;
}

async function finish(
  run: ExperimentRun,
  handle: TraceHandle,
  writeLock: AsyncMutex,
  task: BenchmarkTask,
  repetition: number,
  toolspace: readonly string[],
  evaluation: AttemptEvaluation,
  decision: RouteDecision | null,
  agentUsage: TokenUsage,
  agentLatencyMs: number | null,
): Promise<void> {
  await run.tracer.event(handle, {
    type: "evaluation_completed",
    executionSuccess: evaluation.executionSuccess,
    failureCode: evaluation.code,
    infrastructureReason: evaluation.infrastructureReason,
  });
  const routerUsage = decision?.usage ?? ZERO_USAGE;
  const adaptive = decision?.adaptive;
  const record: RunRecord = {
    taskId: task.id,
    repetition,
    toolspace,
    candidates: decision === null ? null : decision.candidates.map((candidate) => candidate.name),
    scores: decision?.scores ?? null,
    top1Probability: decision?.top1Probability ?? null,
    confidence: decision?.confidence ?? null,
    routerUsage,
    agentUsage,
    pricedCostUsd: attemptPricedCostUsd(run.pricing, run.config, routerUsage, agentUsage, decision),
    providerReportedCostUsd: null,
    routerLatencyMs: decision?.latencyMs ?? null,
    agentLatencyMs,
    recallAtK: evaluation.recallAtK,
    lenientRecallAtK: evaluation.lenientRecallAtK,
    selectionAccuracy: evaluation.selectionAccuracy,
    executionExcluded: evaluation.executionExcluded,
    routingExcluded: evaluation.routingExcluded,
    executionSuccess: evaluation.executionSuccess,
    failureCode: evaluation.code,
    infrastructureReason: evaluation.infrastructureReason,
    adaptivePolicyVersion: adaptive?.policyVersion ?? null,
    adaptiveBranch: adaptive?.branch ?? null,
    adaptiveSelectedK: adaptive?.selectedK ?? null,
    adaptiveEscalationTarget: adaptive?.escalationTarget ?? null,
    adaptiveJevUsage: adaptive?.jevUsage ?? null,
    adaptiveEscalateUsage: adaptive?.escalateUsage ?? null,
    adaptiveJevLatencyMs: adaptive?.jevLatencyMs ?? null,
    adaptiveEscalateLatencyMs: adaptive?.escalateLatencyMs ?? null,
  };
  await writeLock.run(() => {
    run.results.append(record);
  });
}
