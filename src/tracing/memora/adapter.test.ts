import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createScriptedAgent } from "../../agent/mock.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import { createScriptedRouter } from "../../routers/mock.js";
import { openResultDirectory } from "../../results/writer.js";
import { createSmokeRegistry } from "../../tools/smoke.js";
import type { ExperimentConfig } from "../../types/config.js";
import { runExperiment } from "../../eval/runner/run.js";
import {
  createMemoraTracer,
  createMemoraTracerFromEnv,
  sanitizeTracePayload,
  type MemoraRecordClient,
  type RecordedMemoraEvent,
} from "./adapter.js";

const apiKey = "sk-memora-secret-key";

it("skips the client when Memora credentials are absent", () => {
  expect(createMemoraTracerFromEnv({ MEMORA_API_KEY: "", MEMORA_AGENT_ID: "" })).toBeNull();
  expect(createMemoraTracerFromEnv({})).toBeNull();
});

it("keeps pipeline order with a fake client and strips key material", async () => {
  const recorded: RecordedMemoraEvent[] = [];
  const client: MemoraRecordClient = {
    async recordEvent(runId, type, data, parentIds) {
      recorded.push({ runId, type, data, parentIds: parentIds ?? [] });
    },
  };
  const tracer = createMemoraTracer({ client, secrets: [apiKey] });
  const handle = await tracer.startRun({ runId: "run_dir" });
  await tracer.event(handle, {
    type: "task_started",
    taskId: "task_0001",
    repetition: 0,
    toolspace: ["search_email"],
  });
  await tracer.event(handle, {
    type: "routing_completed",
    decision: {
      candidates: [{ name: "search_email", rank: 1, score: 1 }],
      scores: { search_email: 1 },
      top1Probability: 1,
      confidence: 0.5,
      usage: { inputTokens: 1, outputTokens: 0 },
      latencyMs: 1,
      raw: { authorization: `Bearer ${apiKey}`, note: apiKey },
    },
  });
  await tracer.event(handle, {
    type: "evaluation_completed",
    executionSuccess: true,
    failureCode: null,
    infrastructureReason: null,
  });
  await tracer.endRun(handle, "completed");

  expect(recorded.map((event) => event.type)).toEqual([
    "run_started",
    "task_started",
    "routing_completed",
    "evaluation_completed",
    "run_ended",
  ]);
  expect(recorded.every((event) => event.runId === "run_dir")).toBe(true);
  expect(recorded.every((event) => event.parentIds.includes("run_dir") || event.type === "run_started")).toBe(
    true,
  );
  const snapshot = JSON.stringify(recorded);
  expect(snapshot).not.toContain(apiKey);
  expect(snapshot).not.toContain("Bearer sk-");
  expect(sanitizeTracePayload({ env: { MEMORA_API_KEY: apiKey } }, [apiKey])).toEqual({
    env: { MEMORA_API_KEY: "[redacted]" },
  });
});

it("does not fail the experiment when Memora throws", async () => {
  const root = mkdtempSync(join(tmpdir(), "jev-memora-"));
  const config: ExperimentConfig = {
    architecture: "mock",
    toolspaceSize: 5,
    topK: 1,
    datasetPath: "datasets/fixtures/smoke.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "mock", model: "mock-agent", temperature: 0 },
    router: null,
    pricingVersion: "v1",
    tracing: "memora",
  };
  const task: BenchmarkTask = {
    id: "smoke_0001",
    version: 1,
    difficulty: "explicit",
    prompt: "Use smoke alpha",
    required_tools: ["smoke_alpha"],
    acceptable_tools: [],
    expected_sequence: ["smoke_alpha"],
    domains: ["smoke"],
    metadata: {},
    expected_arguments: { label: "alpha" },
  };
  const warnings: string[] = [];
  const tracer = createMemoraTracer({
    client: {
      async recordEvent() {
        throw new Error("memora unavailable");
      },
    },
    onError(error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    },
  });
  const results = openResultDirectory({
    root,
    timestamp: "2026-09-23T170000Z",
    config,
    configHash: "hash",
    datasetVersion: "1",
    registryHash: "reg",
    gitSha: "abc",
  });

  const summary = await runExperiment({
    config,
    tasks: [task],
    registry: createSmokeRegistry(),
    router: createScriptedRouter(new Map([[task.prompt, "smoke_alpha"]])),
    agent: createScriptedAgent(new Map([[task.prompt, { tool: "smoke_alpha", arguments: { label: "alpha" } }]])),
    tracer,
    results,
    pricing: null,
  });

  expect(summary.execution_success_rate).toBe(1);
  expect(summary.attempts).toBe(1);
  expect(warnings.length).toBeGreaterThan(0);
  const runs = readFileSync(join(results.directory, "runs.jsonl"), "utf8").trim();
  expect(runs).not.toBe("");
  expect(JSON.parse(runs).failureCode).toBeNull();
  expect(JSON.parse(runs).executionSuccess).toBe(true);
});
