import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAdaptiveEvalConfig } from "../config/adaptive-eval.js";
import {
  ADAPTIVE_SUMMARY_NOTE,
  buildAdaptiveSummaryTables,
  buildAdaptiveSummaryTablesFromLoads,
  writeAdaptiveSummaryTables,
} from "./adaptive-summary-tables.js";
import type { AdaptiveEvalRun } from "./adaptive-eval-tables.js";
import type { ResultDirectoryLoad } from "./scaling-tables.js";

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
  id: "baseline" | "jev_top1" | "jev_top5" | "adaptive",
  runs: AdaptiveEvalRun[],
): ResultDirectoryLoad {
  return {
    directory: `/tmp/${id}`,
    config: { ...buildAdaptiveEvalConfig(id), configHash: "h" },
    runs,
  };
}

describe("buildAdaptiveSummaryTables", () => {
  it("builds comparison and branch-usage tables without a winner claim", () => {
    const tables = buildAdaptiveSummaryTablesFromLoads([
      load("baseline", [run(), run({ executionSuccess: false, failureCode: "R2" })]),
      load("jev_top1", [run({ candidates: ["gold"] })]),
      load("jev_top5", [run({ candidates: ["gold", "a", "b", "c", "d"], pricedCostUsd: 0.02 })]),
      load("adaptive", [
        run({
          adaptiveBranch: "high",
          adaptiveSelectedK: 1,
          adaptiveEscalationTarget: null,
          pricedCostUsd: 0.015,
        }),
        run({
          adaptiveBranch: "low",
          adaptiveSelectedK: 5,
          adaptiveEscalationTarget: "llm_topk",
          confidence: 0.2,
          pricedCostUsd: 0.025,
        }),
      ]),
    ]);

    expect(tables.note).toBe(ADAPTIVE_SUMMARY_NOTE);
    expect(tables.decision_rule).toBeNull();
    expect("winner" in tables).toBe(false);
    expect("optimal_cell" in tables).toBe(false);
    expect(tables.comparison.map((row) => row.cell_id)).toEqual([
      "baseline",
      "jev_top1",
      "jev_top5",
      "adaptive",
    ]);
    expect(tables.comparison.find((row) => row.cell_id === "jev_top5")?.delta_vs_jev_top5).toBeNull();
    expect(tables.comparison.find((row) => row.cell_id === "adaptive")?.escalation_frequency).toBe(0.5);
    expect(tables.branch_usage).toEqual([
      { branch: "high", count: 1, frequency: 0.5, action: "jev_topk k=1" },
      { branch: "medium", count: 0, frequency: 0, action: "jev_topk k=5" },
      { branch: "low", count: 1, frequency: 0.5, action: "escalate llm_topk k=5" },
    ]);
  });

  it("writes regenerable JSON/CSV artifacts from a results root", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-as-"));
    for (const id of ["baseline", "jev_top1", "jev_top5", "adaptive"] as const) {
      const directory = join(root, id);
      mkdirSync(directory);
      writeFileSync(
        join(directory, "config.json"),
        `${JSON.stringify({ ...buildAdaptiveEvalConfig(id), configHash: "h" }, null, 2)}\n`,
      );
      writeFileSync(
        join(directory, "runs.jsonl"),
        `${JSON.stringify(
          run(
            id === "adaptive"
              ? {
                  adaptiveBranch: "medium",
                  adaptiveSelectedK: 5,
                  adaptiveEscalationTarget: null,
                }
              : {},
          ),
        )}\n`,
      );
    }

    const tables = buildAdaptiveSummaryTables(root);
    const out = mkdtempSync(join(tmpdir(), "jev-as-out-"));
    const paths = writeAdaptiveSummaryTables(tables, out);
    const json = JSON.parse(readFileSync(paths.json, "utf8")) as { branch_usage: unknown[] };
    expect(json.branch_usage).toHaveLength(3);
    expect(readFileSync(paths.comparisonCsv, "utf8")).toContain("cell_id");
    expect(readFileSync(paths.branchCsv, "utf8")).toContain("frequency");
  });
});
