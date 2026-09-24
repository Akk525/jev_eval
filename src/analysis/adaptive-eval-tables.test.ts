import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAdaptiveEvalTables,
  buildAdaptiveEvalTablesFromLoads,
  type AdaptiveEvalRun,
} from "./adaptive-eval-tables.js";
import type { ResultDirectoryLoad } from "./scaling-tables.js";
import { buildAdaptiveEvalConfig } from "../config/adaptive-eval.js";

function run(overrides: Partial<AdaptiveEvalRun> = {}): AdaptiveEvalRun {
  return {
    repetition: 0,
    routingExcluded: false,
    executionExcluded: false,
    executionSuccess: true,
    failureCode: null,
    recallAtK: 1,
    selectionAccuracy: 1,
    confidence: 0.8,
    candidates: ["gold"],
    routerUsage: { inputTokens: 10, outputTokens: 1 },
    agentUsage: { inputTokens: 20, outputTokens: 2 },
    pricedCostUsd: 0.01,
    providerReportedCostUsd: null,
    routerLatencyMs: 5,
    agentLatencyMs: 10,
    adaptiveBranch: null,
    adaptiveEscalationTarget: null,
    adaptiveSelectedK: null,
    ...overrides,
  };
}

function load(
  architecture: "baseline" | "jev" | "adaptive",
  topK: number | null,
  runs: AdaptiveEvalRun[],
  directory = `/tmp/${architecture}-${topK}`,
): ResultDirectoryLoad {
  const id =
    architecture === "baseline"
      ? "baseline"
      : architecture === "adaptive"
        ? "adaptive"
        : topK === 1
          ? "jev_top1"
          : "jev_top5";
  const config = buildAdaptiveEvalConfig(id);
  return {
    directory,
    config: { ...config, configHash: "h" },
    runs,
  };
}

describe("buildAdaptiveEvalTables", () => {
  it("compares adaptive vs fixed-k controls and reports escalation frequency", () => {
    const tables = buildAdaptiveEvalTablesFromLoads([
      load("baseline", null, [run(), run({ executionSuccess: false, failureCode: "R2" })]),
      load("jev", 1, [run({ candidates: ["gold"] }), run({ candidates: ["gold"], recallAtK: 0 })]),
      load("jev", 5, [run({ candidates: ["gold", "a", "b", "c", "d"] })]),
      load(
        "adaptive",
        5,
        [
          run({
            adaptiveBranch: "high",
            adaptiveSelectedK: 1,
            adaptiveEscalationTarget: null,
            candidates: ["gold"],
          }),
          run({
            adaptiveBranch: "low",
            adaptiveSelectedK: 5,
            adaptiveEscalationTarget: "llm_topk",
            candidates: ["gold", "a", "b", "c", "d"],
            confidence: 0.2,
          }),
        ],
        "/tmp/adaptive-holdout",
      ),
    ]);

    expect(tables.held_out_split.rule).toMatch(/odd/);
    expect(tables.rows).toHaveLength(4);
    const adaptive = tables.rows.find((row) => row.architecture === "adaptive");
    expect(adaptive?.escalation_frequency).toBe(0.5);
    expect(adaptive?.branch_counts).toEqual({ high: 1, medium: 0, low: 1 });
    expect(adaptive?.execution_success_rate).toBe(1);
    expect(tables.rows.find((row) => row.cell_id === "jev_top1")?.top_k).toBe(1);
    expect(tables.rows.find((row) => row.cell_id === "baseline")?.escalation_frequency).toBeNull();
  });

  it("discovers adaptive-eval directories from a results root", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ae-"));
    for (const cell of [
      { name: "baseline", id: "baseline" as const },
      { name: "jev1", id: "jev_top1" as const },
      { name: "jev5", id: "jev_top5" as const },
      { name: "adaptive", id: "adaptive" as const },
    ]) {
      const directory = join(root, cell.name);
      mkdirSync(directory);
      writeFileSync(
        join(directory, "config.json"),
        `${JSON.stringify({ ...buildAdaptiveEvalConfig(cell.id), configHash: "h" }, null, 2)}\n`,
      );
      writeFileSync(
        join(directory, "runs.jsonl"),
        `${JSON.stringify(
          run(
            cell.id === "adaptive"
              ? { adaptiveBranch: "medium", adaptiveSelectedK: 5, adaptiveEscalationTarget: null }
              : {},
          ),
        )}\n`,
      );
    }
    const tables = buildAdaptiveEvalTables(root);
    expect(tables.rows.map((row) => row.cell_id)).toEqual([
      "baseline",
      "jev_top1",
      "jev_top5",
      "adaptive",
    ]);
  });
});
