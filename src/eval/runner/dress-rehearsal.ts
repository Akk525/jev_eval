import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DRESS_REHEARSAL_TASK_COUNT,
  DRESS_REHEARSAL_TASK_SUBSET,
  enumerateDressRehearsalCells,
  type DressRehearsalCell,
} from "../../config/dress-rehearsal.js";
import type { MatrixCell } from "../../config/matrix.js";
import { loadDataset, type BenchmarkTask } from "../../dataset/schema.js";
import {
  runMatrix,
  type MatrixOrchestratorOptions,
  type MatrixRunReport,
} from "./matrix.js";

export const DRESS_REHEARSAL_MANIFEST_DIR = "_dress-rehearsal";

export type DressRehearsalOrchestratorOptions = Omit<
  MatrixOrchestratorOptions,
  "cells" | "manifestDir"
> & {
  cells?: readonly DressRehearsalCell[];
  /** Override task subset (tests). Defaults to first 50 by ascending task id. */
  taskFilter?: (tasks: readonly BenchmarkTask[]) => BenchmarkTask[];
};

export interface DressRehearsalRunReport extends MatrixRunReport {
  task_subset: typeof DRESS_REHEARSAL_TASK_SUBSET & {
    task_ids_sample: string[];
  };
}

/**
 * Engineering dress rehearsal: baseline / Jev top-1 / Jev top-5 × N ∈ {5,20,50}
 * on a frozen 50-task subset of v0.2. Manifests under `_dress-rehearsal/`.
 *
 * Numbers from this run must not drive threshold or architecture decisions.
 */
export async function runDressRehearsal(
  options: DressRehearsalOrchestratorOptions,
): Promise<DressRehearsalRunReport> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const cells = dressRehearsalCellsAsMatrix(options.cells ?? enumerateDressRehearsalCells());
  const datasetPath = resolve(
    repoRoot,
    (options.cells ?? enumerateDressRehearsalCells())[0]?.config.datasetPath ??
      "datasets/v0.2/tasks.jsonl",
  );
  const allTasks = options.tasks ?? loadDataset(datasetPath);
  const select =
    options.taskFilter ??
    ((tasks: readonly BenchmarkTask[]) => selectDressRehearsalTasks([...tasks]));
  const subset = select(allTasks);
  if (subset.length !== DRESS_REHEARSAL_TASK_COUNT && options.taskFilter === undefined) {
    throw new Error(
      `dress-rehearsal expected ${DRESS_REHEARSAL_TASK_COUNT} tasks, got ${subset.length}`,
    );
  }
  if (subset.length === 0) {
    throw new Error("dress-rehearsal task subset is empty");
  }

  const report = await runMatrix({
    ...options,
    cells,
    tasks: subset,
    manifestDir: DRESS_REHEARSAL_MANIFEST_DIR,
  });

  const task_subset = {
    ...DRESS_REHEARSAL_TASK_SUBSET,
    task_ids_sample: subset.slice(0, 5).map((task) => task.id),
  };

  if (report.manifestPath !== null) {
    const manifest = JSON.parse(readFileSync(report.manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.task_subset = task_subset;
    writeFileSync(report.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return { ...report, task_subset };
}

/** Ascending `task_NNNN` id, take the first {@link DRESS_REHEARSAL_TASK_COUNT}. */
export function selectDressRehearsalTasks(tasks: readonly BenchmarkTask[]): BenchmarkTask[] {
  return [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, DRESS_REHEARSAL_TASK_COUNT);
}

export function dressRehearsalCellsAsMatrix(
  cells: readonly DressRehearsalCell[] = enumerateDressRehearsalCells(),
): MatrixCell[] {
  return cells.map((cell) => ({
    id: cell.id,
    architecture: cell.architecture,
    toolspaceSize: cell.toolspaceSize,
    relativePath: cell.relativePath,
    config: cell.config,
  }));
}
