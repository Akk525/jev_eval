import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isHoldoutTask } from "../../analysis/adaptive-threshold-select.js";
import {
  ADAPTIVE_EVAL_HOLDOUT_SPLIT,
  ADAPTIVE_EVAL_POLICY_PATH,
  enumerateAdaptiveEvalCells,
  type AdaptiveEvalCell,
} from "../../config/adaptive-eval.js";
import type { MatrixCell } from "../../config/matrix.js";
import { loadDataset, type BenchmarkTask } from "../../dataset/schema.js";
import {
  runMatrix,
  type MatrixOrchestratorOptions,
  type MatrixRunReport,
} from "./matrix.js";

export const ADAPTIVE_EVAL_MANIFEST_DIR = "_adaptive-eval";

export type AdaptiveEvalOrchestratorOptions = Omit<MatrixOrchestratorOptions, "cells" | "manifestDir"> & {
  cells?: readonly AdaptiveEvalCell[];
  /** Override holdout filter (tests). Defaults to odd FNV-1a taskId hash. */
  holdoutFilter?: (task: BenchmarkTask) => boolean;
};

export interface AdaptiveEvalRunReport extends MatrixRunReport {
  held_out_split: typeof ADAPTIVE_EVAL_HOLDOUT_SPLIT & {
    task_count: number;
    task_ids_sample: string[];
    policy_path: string;
  };
}

/**
 * Run adaptive vs fixed-k controls on the #44 holdout split (odd taskId hash).
 * Manifests live under `_adaptive-eval/` and record the held-out rule.
 */
export async function runAdaptiveEval(
  options: AdaptiveEvalOrchestratorOptions,
): Promise<AdaptiveEvalRunReport> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const cells = adaptiveEvalCellsAsMatrix(options.cells ?? enumerateAdaptiveEvalCells());
  const datasetPath = resolve(
    repoRoot,
    (options.cells ?? enumerateAdaptiveEvalCells())[0]?.config.datasetPath ??
      "datasets/v0.1/tasks.jsonl",
  );
  const allTasks = options.tasks ?? loadDataset(datasetPath);
  const holdoutFilter = options.holdoutFilter ?? ((task: BenchmarkTask) => isHoldoutTask(task.id));
  const holdoutTasks = allTasks.filter(holdoutFilter);
  if (holdoutTasks.length === 0) {
    throw new Error("adaptive-eval holdout split selected zero tasks");
  }

  const report = await runMatrix({
    ...options,
    cells,
    tasks: holdoutTasks,
    manifestDir: ADAPTIVE_EVAL_MANIFEST_DIR,
  });

  const held_out_split = {
    ...ADAPTIVE_EVAL_HOLDOUT_SPLIT,
    task_count: holdoutTasks.length,
    task_ids_sample: holdoutTasks.slice(0, 5).map((task) => task.id),
    policy_path: ADAPTIVE_EVAL_POLICY_PATH,
  };

  if (report.manifestPath !== null) {
    const manifest = JSON.parse(readFileSync(report.manifestPath, "utf8")) as Record<string, unknown>;
    manifest.held_out_split = held_out_split;
    writeFileSync(report.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return { ...report, held_out_split };
}

export function adaptiveEvalCellsAsMatrix(
  cells: readonly AdaptiveEvalCell[] = enumerateAdaptiveEvalCells(),
): MatrixCell[] {
  return cells.map((cell) => ({
    architecture: cell.architecture as MatrixCell["architecture"],
    toolspaceSize: cell.toolspaceSize,
    relativePath: cell.relativePath,
    config: cell.config,
  }));
}
