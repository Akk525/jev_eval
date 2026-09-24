import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createScriptedAgent } from "../../agent/mock.js";
import type { Agent, AgentInput } from "../../agent/types.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import { pricedCostUsd } from "../../metrics/metrics.js";
import { loadPricingTable, requireModelPrice } from "../../pricing/load.js";
import { createMockDecisionProvider } from "../../providers/mock/providers.js";
import { createJevRouter } from "../../routers/jev/jev.js";
import type { Router } from "../../routers/types.js";
import { openResultDirectory } from "../../results/writer.js";
import { createToolRegistry, type ToolRegistry } from "../../tools/registry/registry.js";
import { NoopTracer } from "../../tracing/tracer.js";
import type { ExperimentConfig } from "../../types/config.js";
import { attemptPricedCostUsd, runExperiment } from "./run.js";

const names = ["gold", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9"];
const pricingPath = fileURLToPath(new URL("../../../pricing/v1.json", import.meta.url));

const decision = {
  scores: { gold: 0.5, d1: 0.4, d2: 0.1 },
  top1Probability: 0.5,
  confidence: 0.2,
  usage: { inputTokens: 4, outputTokens: 1 },
  raw: null,
};

function registry(): ToolRegistry {
  const created = createToolRegistry(names);
  for (const name of names) {
    created.register({
      definition: {
        name,
        description: `desc ${name}`,
        domain: "files",
        parameters: { type: "object", properties: { query: { type: "string" } } },
        routingSummary: `summary ${name}`,
        nearMisses: name === "gold" ? names.slice(1) : [],
      },
      execute() {
        return { success: true, data: {}, latencyMs: 0 };
      },
    });
  }
  return created;
}

function task(id: string, prompt: string): BenchmarkTask {
  return {
    id,
    version: 1,
    difficulty: "explicit",
    prompt,
    required_tools: ["gold"],
    acceptable_tools: [],
    expected_sequence: ["gold"],
    domains: ["files"],
    metadata: {},
    expected_arguments: { query: "q" },
  };
}

function config(toolspaceSize: number, overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    architecture: "jev",
    toolspaceSize,
    topK: 2,
    datasetPath: "datasets/v0.1/tasks.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "mock", model: "mock-agent", temperature: 0 },
    router: { provider: "mock", model: "jev-1.13.0" },
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
    ...overrides,
  };
}

function watchingAgent(prompts: Map<string, { tool: string; arguments: Record<string, unknown> }>): {
  agent: Agent;
  seen: AgentInput[];
} {
  const seen: AgentInput[] = [];
  const inner = createScriptedAgent(prompts);
  return {
    seen,
    agent: {
      async run(input) {
        seen.push(input);
        return inner.run(input);
      },
    },
  };
}

it("runs mock Jev through the runner and stores the full distribution", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-runner-"));
  const prompt = "Find the gold file";
  const { agent, seen } = watchingAgent(new Map([[prompt, { tool: "gold", arguments: { query: "q" } }]]));
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160000Z",
    config: config(10),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });

  await runExperiment({
    config: config(10),
    tasks: [task("task_0001", prompt)],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([decision])),
    agent,
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });

  const line = results.readRuns()[0];
  expect(line?.toolspace).toEqual(names);
  expect(line?.scores).toEqual(decision.scores);
  expect(line?.top1Probability).toBe(0.5);
  expect(line?.confidence).toBe(0.2);
  expect(seen[0]?.tools.map((tool) => tool.name)).toEqual(["gold", "d1"]);
  expect(seen[0]?.tools[0]?.parameters).toMatchObject({ type: "object" });
});

it("records agent provider failures as R0 and continues the experiment", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-agent-r0-"));
  const first = task("task_0001", "first");
  const second = task("task_0002", "second");
  const agent: Agent = {
    async run(input) {
      if (input.taskPrompt === "first") throw new Error("openai chat request failed: 429");
      return {
        selectedTool: "gold",
        arguments: { query: "q" },
        finalResponse: null,
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        raw: null,
      };
    },
  };
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160001Z",
    config: config(10),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });

  await runExperiment({
    config: config(10),
    tasks: [first, second],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([decision, decision])),
    agent,
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });

  const runs = results.readRuns();
  expect(runs).toHaveLength(2);
  expect(runs[0]?.failureCode).toBe("R0");
  expect(runs[0]?.infrastructureReason).toBe("provider_error");
  expect(runs[0]?.executionExcluded).toBe(true);
  expect(runs[1]?.failureCode).toBeNull();
  expect(runs[1]?.executionSuccess).toBe(true);
});

it("does not append a completed task again after the process stops", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-resume-"));
  const first = task("task_0001", "first");
  const second = task("task_0002", "second");
  const calls = new Map([
    [first.prompt, { tool: "gold", arguments: { query: "q" } }],
    [second.prompt, { tool: "gold", arguments: { query: "q" } }],
  ]);
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160100Z",
    config: config(10),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });

  // Simulate a stop after the first task by only scheduling that work item.
  await runExperiment({
    config: config(10),
    tasks: [first],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([decision])),
    agent: createScriptedAgent(calls),
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });
  expect(results.readRuns().map((run) => run.taskId)).toEqual(["task_0001"]);

  const resumed = openResultDirectory({
    root,
    timestamp: "2026-09-23T160100Z",
    config: config(10),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
    resume: true,
  });
  const seen: string[] = [];
  await runExperiment({
    config: config(10),
    tasks: [first, second],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([decision])),
    agent: {
      async run(input) {
        seen.push(input.taskPrompt);
        return createScriptedAgent(calls).run(input);
      },
    },
    tracer: new NoopTracer(),
    results: resumed,
    pricing: null,
  });

  expect(seen).toEqual(["second"]);
  expect(resumed.readRuns().map((run) => run.taskId)).toEqual(["task_0001", "task_0002"]);
});

it("records a nested toolspace for N=5 inside N=10", async () => {
  const spaces: string[][] = [];
  for (const size of [5, 10]) {
    const root = mkdtempSync(join(tmpdir(), "jev-nest-"));
    const results = openResultDirectory({
      root,
      timestamp: "2026-09-23T160200Z",
      config: config(size),
      configHash: "hash",
      datasetVersion: "1",
      registryHash: "reg",
      gitSha: "abc",
    });
    await runExperiment({
      config: config(size),
      tasks: [task("task_0001", "Find the gold file")],
      registry: registry(),
      router: createJevRouter(createMockDecisionProvider([decision])),
      agent: createScriptedAgent(new Map([["Find the gold file", { tool: "gold", arguments: { query: "q" } }]])),
      tracer: new NoopTracer(),
      results,
      pricing: null,
    });
    spaces.push([...(results.readRuns()[0]?.toolspace ?? [])]);
  }
  const [small, large] = spaces;
  expect(large?.slice(0, small?.length)).toEqual(small);
  expect(small).toEqual(["gold", "d1", "d2", "d3", "d4"]);
});

it("skips the agent when the router fails and still appends the run", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-r0-"));
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160300Z",
    config: config(10),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });
  let agentCalls = 0;
  const router: Router = {
    id: "jev",
    async route() {
      throw new Error("provider down");
    },
  };
  await runExperiment({
    config: config(10),
    tasks: [task("task_0001", "Find the gold file")],
    registry: registry(),
    router,
    agent: {
      async run() {
        agentCalls += 1;
        throw new Error("agent should not run");
      },
    },
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });
  expect(agentCalls).toBe(0);
  expect(results.readRuns()[0]).toMatchObject({
    failureCode: "R0",
    routingExcluded: true,
    executionExcluded: true,
    scores: null,
    top1Probability: null,
    confidence: null,
  });
});

it("stops after routing in router-only mode and records Recall@k", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-router-only-"));
  const prompt = "Find the gold file";
  let agentCalls = 0;
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160350Z",
    config: config(10, { routerOnly: true }),
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });

  await runExperiment({
    config: config(10, { routerOnly: true }),
    tasks: [task("task_0001", prompt)],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([decision])),
    agent: {
      async run() {
        agentCalls += 1;
        throw new Error("agent should not run");
      },
    },
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });

  expect(agentCalls).toBe(0);
  const line = results.readRuns()[0];
  expect(line).toMatchObject({
    candidates: ["gold", "d1"],
    recallAtK: 1,
    selectionAccuracy: null,
    executionExcluded: true,
    routingExcluded: false,
    executionSuccess: false,
    failureCode: null,
    agentUsage: { inputTokens: 0, outputTokens: 0 },
  });
  const summary = JSON.parse(readFileSync(join(results.directory, "summary.json"), "utf8")) as {
    execution_success_rate: number | null;
    execution_scored: number;
    routing_scored: number;
  };
  expect(summary.execution_success_rate).toBeNull();
  expect(summary.execution_scored).toBe(0);
  expect(summary.routing_scored).toBe(1);
});

it("stores token counts that recompute priced_cost_usd from the pricing table", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-price-"));
  const prompt = "Find the gold file";
  const pricedConfig = config(10, {
    agent: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
    router: { provider: "typesafe", model: "jev-1.13.0" },
  });
  const pricing = loadPricingTable(pricingPath);
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160400Z",
    config: pricedConfig,
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });
  const agent: Agent = {
    async run() {
      return {
        selectedTool: "gold",
        arguments: { query: "q" },
        finalResponse: null,
        usage: { inputTokens: 250_000, outputTokens: 50_000 },
        latencyMs: 0,
        raw: null,
      };
    },
  };
  const pricedDecision = {
    ...decision,
    usage: { inputTokens: 1_000_000, outputTokens: 100 },
  };

  await runExperiment({
    config: pricedConfig,
    tasks: [task("task_0001", prompt)],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider([pricedDecision])),
    agent,
    tracer: new NoopTracer(),
    results,
    pricing,
  });

  const line = results.readRuns()[0];
  expect(line?.routerUsage).toEqual({ inputTokens: 1_000_000, outputTokens: 100 });
  expect(line?.agentUsage).toEqual({ inputTokens: 250_000, outputTokens: 50_000 });
  expect(line?.pricedCostUsd).toBe(2.042);
  expect(line?.providerReportedCostUsd).toBeNull();
  const recomputed = attemptPricedCostUsd(
    pricing,
    pricedConfig,
    line?.routerUsage ?? { inputTokens: 0, outputTokens: 0 },
    line?.agentUsage ?? { inputTokens: 0, outputTokens: 0 },
  );
  expect(recomputed).toBe(line?.pricedCostUsd);
  expect(
    pricedCostUsd(line!.routerUsage, requireModelPrice(pricing, "typesafe", "jev-1.13.0")) +
      pricedCostUsd(line!.agentUsage, requireModelPrice(pricing, "openai", "gpt-5.6-sol")),
  ).toBe(2.042);
  const summary = JSON.parse(readFileSync(join(results.directory, "summary.json"), "utf8")) as {
    priced_cost_usd: number;
  };
  expect(summary.priced_cost_usd).toBe(2.042);
});

it("writes three raw attempts per task and by_repetition stats when repetitions is 3", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-reps-"));
  const first = task("task_0001", "first");
  const second = task("task_0002", "second");
  const repeated = config(10, { repetitions: 3 });
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T160500Z",
    config: repeated,
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });
  const decisions = Array.from({ length: 6 }, () => decision);
  await runExperiment({
    config: repeated,
    tasks: [first, second],
    registry: registry(),
    router: createJevRouter(createMockDecisionProvider(decisions)),
    agent: createScriptedAgent(
      new Map([
        [first.prompt, { tool: "gold", arguments: { query: "q" } }],
        [second.prompt, { tool: "gold", arguments: { query: "q" } }],
      ]),
    ),
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });

  const runs = results.readRuns();
  expect(runs).toHaveLength(6);
  expect(runs.map((run) => [run.taskId, run.repetition])).toEqual([
    ["task_0001", 0],
    ["task_0001", 1],
    ["task_0001", 2],
    ["task_0002", 0],
    ["task_0002", 1],
    ["task_0002", 2],
  ]);
  const summary = JSON.parse(readFileSync(join(results.directory, "summary.json"), "utf8")) as {
    attempts: number;
    execution_success_rate: number;
    execution_success_rate_stats: { mean: number; stddev: number | null };
    by_repetition: { repetitions: number; execution_success_rate: { mean: number } };
  };
  expect(summary.attempts).toBe(6);
  expect(summary.execution_success_rate).toBe(1);
  expect(summary.execution_success_rate_stats.mean).toBe(1);
  expect(summary.by_repetition.repetitions).toBe(3);
  expect(summary.by_repetition.execution_success_rate.mean).toBe(1);
});

it("keeps toolspaces and candidates identical at concurrency 1 and 4", async () => {
  async function capture(concurrency: number) {
    const root = mkdtempSync(join(tmpdir(), "jev-conc-"));
    const tasks = [task("task_0001", "a"), task("task_0002", "b"), task("task_0003", "c"), task("task_0004", "d")];
    const cfg = config(10, { concurrency });
    const results = openResultDirectory({
      root,
      timestamp: `2026-09-23T170${concurrency}00Z`,
      config: cfg,
      configHash: `hash-${concurrency}`,
      datasetVersion: "1",
      registryHash: "reg",
      gitSha: "abc",
    });
    const prompts = new Map(
      tasks.map((item) => [item.prompt, { tool: "gold", arguments: { query: "q" } }] as const),
    );
    const decisions = Array.from({ length: tasks.length }, () => decision);
    await runExperiment({
      config: cfg,
      tasks,
      registry: registry(),
      router: createJevRouter(createMockDecisionProvider(decisions)),
      agent: createScriptedAgent(prompts),
      tracer: new NoopTracer(),
      results,
      pricing: null,
    });
    const stored = JSON.parse(readFileSync(join(results.directory, "config.json"), "utf8")) as {
      concurrency: number;
    };
    expect(stored.concurrency).toBe(concurrency);
    return results
      .readRuns()
      .map((run) => ({
        taskId: run.taskId,
        repetition: run.repetition,
        toolspace: run.toolspace,
        candidates: run.candidates,
        failureCode: run.failureCode,
      }))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
  }

  expect(await capture(4)).toEqual(await capture(1));
});

it("still classifies provider router failures as R0 under concurrency > 1", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-conc-r0-"));
  const cfg = config(10, { concurrency: 3 });
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T171000Z",
    config: cfg,
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });
  const failing: Router = {
    id: "jev",
    async route() {
      throw new Error("provider down");
    },
  };
  await runExperiment({
    config: cfg,
    tasks: [task("task_0001", "a"), task("task_0002", "b")],
    registry: registry(),
    router: failing,
    agent: createScriptedAgent(new Map()),
    tracer: new NoopTracer(),
    results,
    pricing: null,
  });
  const runs = results.readRuns();
  expect(runs).toHaveLength(2);
  expect(runs.every((run) => run.failureCode === "R0")).toBe(true);
  expect(runs.every((run) => run.routingExcluded)).toBe(true);
});
