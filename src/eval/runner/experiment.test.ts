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
  let callsBeforeStop = 0;
  const stopping: Agent = {
    async run(input) {
      callsBeforeStop += 1;
      if (callsBeforeStop > 1) throw new Error("killed");
      return createScriptedAgent(calls).run(input);
    },
  };

  await expect(
    runExperiment({
      config: config(10),
      tasks: [first, second],
      registry: registry(),
      router: createJevRouter(createMockDecisionProvider([decision, decision])),
      agent: stopping,
      tracer: new NoopTracer(),
      results,
      pricing: null,
    }),
  ).rejects.toThrow(/killed/);
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
