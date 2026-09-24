import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnalysisDatasetError,
  M5_SKIP_REASON,
  buildAnalysisDataset,
  buildAnalysisDatasetFromLoads,
  writeAnalysisDataset,
  type AnalysisDirectoryLoad,
  type StoredExperimentConfig,
} from "./dataset.js";
import type { RunRecord } from "../results/writer.js";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    taskId: "task_0001",
    repetition: 0,
    toolspace: ["gold", "near"],
    candidates: ["gold"],
    scores: { gold: 0.9, near: 0.1 },
    top1Probability: 0.9,
    confidence: 0.8,
    routerUsage: { inputTokens: 10, outputTokens: 1 },
    agentUsage: { inputTokens: 20, outputTokens: 2 },
    pricedCostUsd: 0.01,
    providerReportedCostUsd: null,
    routerLatencyMs: 5,
    agentLatencyMs: 10,
    recallAtK: 1,
    lenientRecallAtK: 1,
    selectionAccuracy: 1,
    executionExcluded: false,
    routingExcluded: false,
    executionSuccess: true,
    failureCode: null,
    infrastructureReason: null,
    adaptivePolicyVersion: null,
    adaptiveBranch: null,
    adaptiveSelectedK: null,
    adaptiveEscalationTarget: null,
    adaptiveJevUsage: null,
    adaptiveEscalateUsage: null,
    adaptiveJevLatencyMs: null,
    adaptiveEscalateLatencyMs: null,
    ...overrides,
  };
}

function storedConfig(
  architecture: "baseline" | "jev" | "llm",
  n: number,
  topK: number | null,
  overrides: Partial<StoredExperimentConfig> = {},
): StoredExperimentConfig {
  return {
    architecture,
    toolspaceSize: n,
    topK,
    datasetPath: "datasets/v0.2/tasks.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
    router:
      architecture === "baseline"
        ? null
        : architecture === "jev"
          ? { provider: "typesafe", model: "jev-1.13.0" }
          : { provider: "openai", model: "gpt-5.6-sol" },
    escalateRouter: null,
    adaptivePolicyPath: null,
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
    configHash: "hash-a",
    datasetVersion: "1",
    registryHash: "registry-a",
    gitSha: "abc1234",
    ...overrides,
  };
}

function writeEpoch(
  root: string,
  name: string,
  config: StoredExperimentConfig,
  runs: RunRecord[],
): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(directory, "runs.jsonl"), runs.map((item) => JSON.stringify(item)).join("\n") + "\n");
  return directory;
}

describe("buildAnalysisDataset", () => {
  it("merges compatible architecture × N dirs into one normalized dataset", () => {
    const loads: AnalysisDirectoryLoad[] = [
      {
        directory: "/tmp/baseline-n5",
        config: storedConfig("baseline", 5, null),
        runs: [run({ taskId: "task_0001", executionSuccess: true })],
      },
      {
        directory: "/tmp/jev-n10",
        config: storedConfig("jev", 10, 5),
        runs: [
          run({
            taskId: "task_0002",
            recallAtK: 0,
            confidence: 0.4,
            top1Probability: 0.55,
          }),
        ],
      },
      {
        directory: "/tmp/llm-n10",
        config: storedConfig("llm", 10, 5),
        runs: [run({ taskId: "task_0003", candidates: ["near", "gold"], selectionAccuracy: 0 })],
      },
    ];

    const dataset = buildAnalysisDatasetFromLoads(loads, "/tmp/results", () => new Date("2026-09-23T12:00:00.000Z"));
    expect(dataset.version).toBe(1);
    expect(dataset.built_at).toBe("2026-09-23T12:00:00.000Z");
    expect(dataset.attempt_count).toBe(3);
    expect(dataset.source_directories).toEqual(["/tmp/baseline-n5", "/tmp/jev-n10", "/tmp/llm-n10"]);
    expect(dataset.m5_adaptive_tables).toBe("skipped");
    expect(dataset.m5_skip_reason).toBe(M5_SKIP_REASON);
    expect(dataset.compatibility).toEqual({
      datasetPath: "datasets/v0.2/tasks.jsonl",
      datasetVersion: "1",
      registryHash: "registry-a",
      pricingVersion: "v1",
      agentProvider: "openai",
      agentModel: "gpt-5.6-sol",
      agentTemperature: 0,
      seed: 0,
      tracing: "noop",
    });

    const jev = dataset.attempts.find((attempt) => attempt.architecture === "jev");
    expect(jev).toMatchObject({
      source_directory: "/tmp/jev-n10",
      toolspace_size: 10,
      top_k: 5,
      task_id: "task_0002",
      recall_at_k: 0,
      confidence: 0.4,
      top1_probability: 0.55,
      router_provider: "typesafe",
      router_model: "jev-1.13.0",
    });
  });

  it("rejects incompatible dirs with a clear mismatch error", () => {
    const loads: AnalysisDirectoryLoad[] = [
      {
        directory: "/tmp/a",
        config: storedConfig("baseline", 5, null, { datasetVersion: "1" }),
        runs: [run()],
      },
      {
        directory: "/tmp/b",
        config: storedConfig("jev", 10, 5, { datasetVersion: "2", registryHash: "registry-b" }),
        runs: [run()],
      },
    ];

    expect(() => buildAnalysisDatasetFromLoads(loads)).toThrow(AnalysisDatasetError);
    expect(() => buildAnalysisDatasetFromLoads(loads)).toThrow(
      /incompatible result directories: \/tmp\/a vs \/tmp\/b: datasetVersion: 1 vs 2; registryHash: registry-a vs registry-b/,
    );
  });

  it("rejects agent model mismatches", () => {
    const loads: AnalysisDirectoryLoad[] = [
      {
        directory: "/tmp/a",
        config: storedConfig("baseline", 5, null),
        runs: [run()],
      },
      {
        directory: "/tmp/b",
        config: storedConfig("baseline", 10, null, {
          agent: { provider: "openai", model: "gpt-other", temperature: 0 },
        }),
        runs: [run()],
      },
    ];
    expect(() => buildAnalysisDatasetFromLoads(loads)).toThrow(/agentModel: gpt-5\.6-sol vs gpt-other/);
  });

  it("discovers fixture dirs on disk and writes analysis artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-analysis-"));
    writeEpoch(root, "baseline-n5", storedConfig("baseline", 5, null), [
      run({ taskId: "task_0001", pricedCostUsd: 0.02 }),
    ]);
    writeEpoch(root, "jev-n5", storedConfig("jev", 5, 3), [run({ taskId: "task_0002" })]);

    const dataset = buildAnalysisDataset(root, () => new Date("2026-01-01T00:00:00.000Z"));
    expect(dataset.attempt_count).toBe(2);
    expect(dataset.source_directories).toHaveLength(2);

    const out = join(root, "analysis-out");
    const paths = writeAnalysisDataset(dataset, out);
    expect(paths.jsonPath).toBe(join(out, "analysis-dataset.json"));
    expect(paths.jsonlPath).toBe(join(out, "attempts.jsonl"));
    expect(paths.compatibilityPath).toBe(join(out, "compatibility.json"));
  });

  it("fails loud when stored config metadata is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-analysis-missing-"));
    const directory = join(root, "epoch");
    mkdirSync(directory, { recursive: true });
    const incomplete = storedConfig("baseline", 5, null);
    const { datasetVersion: _drop, ...withoutVersion } = incomplete;
    writeFileSync(join(directory, "config.json"), `${JSON.stringify(withoutVersion, null, 2)}\n`);
    writeFileSync(join(directory, "runs.jsonl"), `${JSON.stringify(run())}\n`);

    expect(() => buildAnalysisDataset(root)).toThrow(/missing datasetVersion/);
  });
});
