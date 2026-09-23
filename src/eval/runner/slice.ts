import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createScriptedAgent, type ScriptedCall } from "../../agent/mock.js";
import { createBaselineRouter } from "../../routers/baseline/baseline.js";
import { createJevRouter } from "../../routers/jev/jev.js";
import type { Router } from "../../routers/types.js";
import { configHash, loadExperimentConfig } from "../../config/load.js";
import { loadDataset, type BenchmarkTask } from "../../dataset/schema.js";
import { loadPricingTable } from "../../pricing/load.js";
import type { DecisionProvider, DecisionRequest, DecisionResponse } from "../../providers/types.js";
import { openResultDirectory } from "../../results/writer.js";
import { createCatalogRegistry } from "../../tools/catalog.js";
import { catalogFixture } from "../../tools/fixtures/catalog.js";
import { createMemoraTracerFromEnv } from "../../tracing/memora/adapter.js";
import { NoopTracer, type Tracer } from "../../tracing/tracer.js";
import type { ExperimentConfig } from "../../types/config.js";
import { resultTimestamp } from "./smoke.js";
import { runExperiment } from "./run.js";

export interface MockedSliceCommand {
  configPath: string;
  resultsRoot: string;
  /** Defaults to the config dataset. Pass a subset for faster tests. */
  tasks?: readonly BenchmarkTask[];
  timestamp?: string;
  resume?: boolean;
  tracer?: Tracer;
  /** Override toolspace size without rewriting the config file. */
  toolspaceSize?: number;
  /** Force every router call to throw (R0 path). */
  failRouter?: boolean;
  pricingPath?: string;
  /** Override config.routerOnly. When true, the agent is never called. */
  routerOnly?: boolean;
}

/**
 * Offline vertical-slice run for baseline or Jev.
 *
 * Example:
 * `npm run eval -- --config configs/jev-top5-20.yaml --mock --results /tmp/jev-slice`
 */
export async function runMockedSlice(command: MockedSliceCommand): Promise<string> {
  const loaded = loadExperimentConfig(command.configPath);
  if (loaded.config.architecture !== "baseline" && loaded.config.architecture !== "jev") {
    throw new Error(`mocked slice supports baseline and jev, not ${loaded.config.architecture}`);
  }
  const architecture = loaded.config.architecture;

  const config: ExperimentConfig = {
    ...loaded.config,
    architecture,
    ...(command.toolspaceSize === undefined ? {} : { toolspaceSize: command.toolspaceSize }),
    ...(command.routerOnly === true ? { routerOnly: true } : {}),
  };
  const hash = configHash(config);
  const tasks = command.tasks ?? loadDataset(resolve(config.datasetPath));
  const registry = createCatalogRegistry();
  const script = scriptFromTasks(tasks);
  const pricing = loadPricingTable(command.pricingPath ?? resolve("pricing", `${config.pricingVersion}.json`));
  const tracer =
    command.tracer ??
    (config.tracing === "memora" ? createMemoraTracerFromEnv() ?? new NoopTracer() : new NoopTracer());
  const results = openResultDirectory({
    root: command.resultsRoot,
    timestamp: command.timestamp ?? resultTimestamp(new Date()),
    config,
    configHash: hash,
    datasetVersion: String(tasks[0]?.version ?? 1),
    registryHash: registry.hash(),
    gitSha: gitSha(),
    ...(command.resume === true ? { resume: true } : {}),
  });

  await runExperiment({
    config,
    tasks,
    registry,
    router: command.failRouter === true ? failingRouter(architecture) : routerFor(config, script.preferred),
    agent: createScriptedAgent(script.calls),
    tracer,
    results,
    pricing,
    fixture: catalogFixture,
  });
  return results.directory;
}

function routerFor(config: ExperimentConfig, preferredByPrompt: ReadonlyMap<string, string>): Router {
  if (config.architecture === "baseline") return createBaselineRouter();
  if (config.architecture !== "jev") throw new Error(`mocked slice supports baseline and jev, not ${config.architecture}`);
  return createJevRouter(createPreferredDecisionProvider(preferredByPrompt));
}

function failingRouter(architecture: "baseline" | "jev"): Router {
  return {
    id: architecture,
    async route() {
      throw new Error("provider down");
    },
  };
}

/** Scores the preferred tool first. Confidence stays distinct from top-1 probability. */
export function createPreferredDecisionProvider(
  preferredByPrompt: ReadonlyMap<string, string>,
): DecisionProvider {
  return {
    async decide(request: DecisionRequest): Promise<DecisionResponse> {
      const names = Object.keys(request.criteria);
      const preferred = preferredByPrompt.get(request.state);
      const winner = preferred !== undefined && names.includes(preferred) ? preferred : names[0];
      if (winner === undefined) throw new Error("decision criteria are empty");
      const remainder = names.length <= 1 ? 0 : 0.1 / (names.length - 1);
      const scores: Record<string, number> = {};
      for (const name of names) scores[name] = name === winner ? 0.9 : remainder;
      return {
        scores,
        top1Probability: 0.9,
        confidence: 0.35,
        usage: { inputTokens: 12, outputTokens: 2 },
        raw: null,
      };
    },
  };
}

function scriptFromTasks(tasks: readonly BenchmarkTask[]): {
  preferred: Map<string, string>;
  calls: Map<string, ScriptedCall>;
} {
  const preferred = new Map<string, string>();
  const calls = new Map<string, ScriptedCall>();
  for (const task of tasks) {
    const tool = task.required_tools[0];
    if (tool === undefined) continue;
    preferred.set(task.prompt, tool);
    calls.set(task.prompt, { tool, arguments: task.expected_arguments ?? {} });
  }
  return { preferred, calls };
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
