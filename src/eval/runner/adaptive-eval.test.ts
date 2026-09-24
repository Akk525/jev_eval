import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAdaptiveEvalTables } from "../../analysis/adaptive-eval-tables.js";
import { isHoldoutTask } from "../../analysis/adaptive-threshold-select.js";
import {
  ADAPTIVE_EVAL_HOLDOUT_SPLIT,
  enumerateAdaptiveEvalCells,
} from "../../config/adaptive-eval.js";
import { loadDataset } from "../../dataset/schema.js";
import { runAdaptiveEval } from "./adaptive-eval.js";

describe("runAdaptiveEval", () => {
  it("runs mock adaptive vs fixed-k on the odd-hash holdout and reports escalation", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ae-run-"));
    const all = loadDataset("datasets/v0.1/tasks.jsonl");
    const holdout = all.filter((task) => isHoldoutTask(task.id)).slice(0, 4);
    expect(holdout.length).toBeGreaterThan(0);

    const report = await runAdaptiveEval({
      resultsRoot: root,
      mock: true,
      timestamp: "2026-09-24T050000Z",
      tasks: holdout,
      cells: enumerateAdaptiveEvalCells(),
    });

    expect(report.failed).toBe(0);
    expect(report.completed).toBe(4);
    expect(report.held_out_split.rule).toBe(ADAPTIVE_EVAL_HOLDOUT_SPLIT.rule);
    expect(report.held_out_split.task_count).toBe(4);
    expect(report.manifestPath).not.toBeNull();

    const manifest = JSON.parse(readFileSync(report.manifestPath!, "utf8")) as {
      held_out_split: { rule: string; task_count: number };
    };
    expect(manifest.held_out_split.task_count).toBe(4);

    const dirs = readdirSync(root).filter((name) => !name.startsWith("_"));
    expect(dirs.some((name) => name.includes("_adaptive_"))).toBe(true);
    expect(dirs.some((name) => name.includes("_jev_") && name.includes("_k1_"))).toBe(true);
    expect(dirs.some((name) => name.includes("_jev_") && name.includes("_k5_"))).toBe(true);
    expect(dirs.some((name) => name.includes("_baseline_"))).toBe(true);

    const tables = buildAdaptiveEvalTables(root);
    expect(tables.rows.map((row) => row.cell_id)).toEqual([
      "baseline",
      "jev_top1",
      "jev_top5",
      "adaptive",
    ]);
    const adaptive = tables.rows.find((row) => row.cell_id === "adaptive");
    expect(adaptive?.escalation_frequency).not.toBeNull();
    expect(adaptive?.attempts).toBe(4);
    // Mocked preferred confidence is 0.35 → always low → escalate.
    expect(adaptive?.escalation_frequency).toBe(1);
    expect(adaptive?.branch_counts?.low).toBe(4);
  }, 60_000);
});
