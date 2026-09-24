import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildKSweepTables,
  buildKSweepTablesFromLoads,
  kSweepTablesToCsv,
  type KSweepTableRow,
} from "./k-sweep-tables.js";
import type { ResultDirectoryLoad, ScalingRun } from "./scaling-tables.js";
import { K_SWEEP_TOOLSPACE_SIZE } from "../config/k-sweep.js";

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
    candidates: ["gold", "d1"],
    routerUsage: { inputTokens: 10, outputTokens: 1 },
    agentUsage: { inputTokens: 100, outputTokens: 2 },
    pricedCostUsd: 0.05,
    providerReportedCostUsd: null,
    routerLatencyMs: 5,
    agentLatencyMs: 20,
    ...overrides,
  };
}

function config(topK: number) {
  return {
    architecture: "jev" as const,
    toolspaceSize: K_SWEEP_TOOLSPACE_SIZE,
    topK,
    datasetPath: "datasets/v0.2/tasks.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
    router: { provider: "typesafe", model: "jev-1.13.0" },
    escalateRouter: null,
    adaptivePolicyPath: null,
    pricingVersion: "v1",
    tracing: "noop" as const,
    routerOnly: false,
  };
}

describe("buildKSweepTables", () => {
  it("aggregates fixture dirs by k with hand-checked cells", () => {
    const loads: ResultDirectoryLoad[] = [
      {
        directory: "/tmp/jev-k1",
        config: config(1),
        runs: [
          run({
            candidates: ["gold"],
            recallAtK: 1,
            selectionAccuracy: 1,
            executionSuccess: true,
            pricedCostUsd: 0.1,
            agentUsage: { inputTokens: 50, outputTokens: 0 },
          }),
          run({
            candidates: ["d1"],
            recallAtK: 0,
            selectionAccuracy: 0,
            executionSuccess: false,
            failureCode: "R2",
            pricedCostUsd: 0.2,
            agentUsage: { inputTokens: 50, outputTokens: 0 },
          }),
        ],
      },
      {
        directory: "/tmp/jev-k5",
        config: config(5),
        runs: [
          run({
            candidates: ["gold", "a", "b", "c", "d"],
            recallAtK: 1,
            selectionAccuracy: 1,
            pricedCostUsd: 0.3,
            agentUsage: { inputTokens: 200, outputTokens: 0 },
          }),
        ],
      },
      // Non k-sweep N must be ignored.
      {
        directory: "/tmp/jev-n50",
        config: { ...config(5), toolspaceSize: 50 },
        runs: [run()],
      },
    ];

    const tables = buildKSweepTablesFromLoads(loads);
    expect(tables.rows.map((row) => row.top_k)).toEqual([1, 5]);

    const k1 = tables.rows[0] as KSweepTableRow;
    expect(k1.toolspace_size).toBe(25);
    expect(k1.attempts).toBe(2);
    expect(k1.recall_at_k).toBe(0.5);
    expect(k1.selection_accuracy).toBe(0.5);
    expect(k1.execution_success_rate).toBe(0.5);
    expect(k1.mean_candidate_count).toBe(1);
    expect(k1.priced_cost_usd).toBeCloseTo(0.3);
    expect(k1.agent_input_tokens).toBe(100);

    const k5 = tables.rows[1] as KSweepTableRow;
    expect(k5.recall_at_k).toBe(1);
    expect(k5.mean_candidate_count).toBe(5);
    expect(k5.agent_input_tokens).toBe(200);
    expect(k5.priced_cost_usd).toBeCloseTo(0.3);
  });

  it("loads k-sweep epochs from disk and emits csv", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-k-sweep-tables-"));
    for (const topK of [1, 3] as const) {
      const directory = join(root, `2026-01-01T000000Z_jev_n25_k${topK}_abc`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "config.json"), `${JSON.stringify(config(topK), null, 2)}\n`);
      const runs = [
        run({
          candidates: Array.from({ length: topK }, (_, i) => `t${i}`),
          recallAtK: topK === 1 ? 0 : 1,
          selectionAccuracy: topK === 1 ? 0 : 1,
          pricedCostUsd: 0.01 * topK,
        }),
      ];
      writeFileSync(join(directory, "runs.jsonl"), `${runs.map((item) => JSON.stringify(item)).join("\n")}\n`);
    }
    mkdirSync(join(root, "_k-sweep"), { recursive: true });

    const tables = buildKSweepTables(root);
    expect(tables.rows.map((row) => row.top_k)).toEqual([1, 3]);
    expect(tables.rows[0]!.mean_candidate_count).toBe(1);
    expect(tables.rows[1]!.mean_candidate_count).toBe(3);
    expect(tables.rows[0]!.recall_at_k).toBe(0);
    expect(tables.rows[1]!.recall_at_k).toBe(1);

    const csv = kSweepTablesToCsv(tables);
    expect(csv.split("\n")[0]).toContain("mean_candidate_count");
    expect(csv).toContain("jev,25,1,");
    expect(csv).toContain("jev,25,3,");
  });
});
