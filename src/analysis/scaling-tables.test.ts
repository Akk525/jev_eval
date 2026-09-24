import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildScalingTables,
  buildScalingTablesFromLoads,
  scalingTablesToCsv,
  type ResultDirectoryLoad,
  type ScalingRun,
} from "./scaling-tables.js";

function run(overrides: Partial<ScalingRun> = {}): ScalingRun {
  return {
    repetition: 0,
    routingExcluded: false,
    executionExcluded: false,
    executionSuccess: true,
    failureCode: null,
    recallAtK: 1,
    confidence: 0.8,
    selectionAccuracy: 1,
    candidates: ["gold"],
    routerUsage: { inputTokens: 10, outputTokens: 1 },
    agentUsage: { inputTokens: 20, outputTokens: 2 },
    pricedCostUsd: 0.01,
    providerReportedCostUsd: null,
    routerLatencyMs: 5,
    agentLatencyMs: 10,
    totalLatencyMs: 20,
    ...overrides,
  };
}

function config(architecture: "baseline" | "jev" | "llm", n: number, topK: number | null) {
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
    tracing: "noop" as const,
    routerOnly: false,
  };
}

function writeEpoch(
  root: string,
  name: string,
  architecture: "baseline" | "jev" | "llm",
  n: number,
  topK: number | null,
  runs: ScalingRun[],
): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "config.json"), `${JSON.stringify(config(architecture, n, topK), null, 2)}\n`);
  writeFileSync(join(directory, "runs.jsonl"), runs.map((item) => JSON.stringify(item)).join("\n") + "\n");
  writeFileSync(join(directory, "summary.json"), "{}\n");
  return directory;
}

describe("buildScalingTables", () => {
  it("groups fixture directories by architecture × N with hand-checked cells", () => {
    const loads: ResultDirectoryLoad[] = [
      {
        directory: "/tmp/baseline-n5-a",
        config: config("baseline", 5, null),
        runs: [
          run({ executionSuccess: true, recallAtK: 1, selectionAccuracy: 1, pricedCostUsd: 0.02 }),
          run({
            executionSuccess: false,
            recallAtK: 1,
            selectionAccuracy: 0,
            failureCode: "R2",
            pricedCostUsd: 0.01,
          }),
        ],
      },
      {
        directory: "/tmp/baseline-n5-b",
        config: config("baseline", 5, null),
        runs: [
          run({
            routingExcluded: true,
            executionExcluded: true,
            failureCode: "R0",
            recallAtK: null,
            selectionAccuracy: null,
            pricedCostUsd: 0,
            routerLatencyMs: null,
            agentLatencyMs: null,
            totalLatencyMs: 3,
          }),
        ],
      },
      {
        directory: "/tmp/jev-n10",
        config: config("jev", 10, 5),
        runs: [
          run({ recallAtK: 1, executionSuccess: true, selectionAccuracy: 1 }),
          run({ recallAtK: 0, executionSuccess: true, selectionAccuracy: 1 }),
        ],
      },
    ];

    const tables = buildScalingTablesFromLoads(loads);
    expect(tables.rows).toHaveLength(2);

    const baseline = tables.rows.find((row) => row.architecture === "baseline" && row.toolspace_size === 5);
    expect(baseline).toBeDefined();
    expect(baseline!.attempts).toBe(3);
    expect(baseline!.r0_attempts).toBe(1);
    expect(baseline!.infrastructure_failure_rate).toBeCloseTo(1 / 3);
    expect(baseline!.execution_scored).toBe(2);
    expect(baseline!.execution_success_rate).toBe(0.5);
    expect(baseline!.selection_scored).toBe(2);
    expect(baseline!.selection_accuracy).toBe(0.5);
    expect(baseline!.recall_at_k).toBe(1);
    expect(baseline!.priced_cost_usd).toBeCloseTo(0.03);
    expect(baseline!.failure_taxonomy).toEqual({
      R0: 1,
      R1: 0,
      R2: 1,
      R3: 0,
      R4: 0,
      R5: 0,
      R6: 0,
      none: 1,
    });
    expect(baseline!.source_directories).toHaveLength(2);

    const jev = tables.rows.find((row) => row.architecture === "jev" && row.toolspace_size === 10);
    expect(jev).toBeDefined();
    expect(jev!.recall_at_k).toBe(0.5);
    expect(jev!.top_k).toBe(5);
    expect(jev!.execution_success_rate).toBe(1);
    expect(jev!.failure_taxonomy.none).toBe(2);
  });

  it("refuses to mix router-only and full-agent epochs in one architecture × N cell", () => {
    expect(() =>
      buildScalingTablesFromLoads([
        {
          directory: "/tmp/full",
          config: { ...config("jev", 5, 5), routerOnly: false },
          runs: [run()],
        },
        {
          directory: "/tmp/router-only",
          config: { ...config("jev", 5, 5), routerOnly: true },
          runs: [run({ executionExcluded: true, selectionAccuracy: null })],
        },
      ]),
    ).toThrow(/routerOnly mismatch/);
  });

  it("refuses topK mismatches inside the same architecture × N cell", () => {
    expect(() =>
      buildScalingTablesFromLoads([
        {
          directory: "/tmp/k5",
          config: config("jev", 25, 5),
          runs: [run()],
        },
        {
          directory: "/tmp/k3",
          config: config("jev", 25, 3),
          runs: [run()],
        },
      ]),
    ).toThrow(/topK mismatch/);
  });

  it("loads multi-dir fixtures from disk and emits csv cells", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-scaling-tables-"));
    writeEpoch(root, "2026-01-01T000000Z_baseline_n5_kall_abc", "baseline", 5, null, [
      run({ executionSuccess: true, pricedCostUsd: 0.1, routerUsage: { inputTokens: 100, outputTokens: 0 } }),
      run({ executionSuccess: false, failureCode: "R2", pricedCostUsd: 0.2 }),
    ]);
    writeEpoch(root, "2026-01-01T000001Z_jev_n5_k5_abc", "jev", 5, 5, [
      run({ recallAtK: 1 }),
      run({ recallAtK: 0 }),
    ]);
    mkdirSync(join(root, "_matrix"), { recursive: true });

    const tables = buildScalingTables(root);
    expect(tables.rows.map((row) => `${row.architecture}:${row.toolspace_size}`)).toEqual([
      "baseline:5",
      "jev:5",
    ]);
    expect(tables.rows[0]!.execution_success_rate).toBe(0.5);
    expect(tables.rows[0]!.priced_cost_usd).toBeCloseTo(0.3);
    expect(tables.rows[1]!.recall_at_k).toBe(0.5);

    const csv = scalingTablesToCsv(tables);
    expect(csv.split("\n")[0]).toContain("execution_success_rate");
    expect(csv).toContain("baseline,5,");
    expect(csv).toContain("jev,5,5,");
  });
});
