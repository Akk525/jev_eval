import {
  K_SWEEP_TOOLSPACE_SIZE,
  enumerateKSweepCells,
  type KSweepCell,
} from "../../config/k-sweep.js";
import type { MatrixCell } from "../../config/matrix.js";
import {
  runMatrix,
  type MatrixOrchestratorOptions,
  type MatrixRunReport,
} from "./matrix.js";

export const K_SWEEP_MANIFEST_DIR = "_k-sweep";

export type KSweepOrchestratorOptions = Omit<MatrixOrchestratorOptions, "cells" | "manifestDir"> & {
  /** Override the default k-sweep enumeration (tests). */
  cells?: readonly KSweepCell[];
};

/** Map k-sweep cells onto the shared matrix orchestrator cell shape. */
export function kSweepCellsAsMatrix(cells: readonly KSweepCell[] = enumerateKSweepCells()): MatrixCell[] {
  return cells.map((cell) => ({
    id: cell.id,
    architecture: "jev",
    toolspaceSize: K_SWEEP_TOOLSPACE_SIZE,
    relativePath: cell.relativePath,
    config: cell.config,
  }));
}

/**
 * Execute or plan the M4 Jev top-k sweep serially.
 * Manifests live under `_k-sweep/` so they do not collide with the M3 N-matrix.
 */
export async function runKSweep(options: KSweepOrchestratorOptions): Promise<MatrixRunReport> {
  const cells = kSweepCellsAsMatrix(options.cells ?? enumerateKSweepCells());
  return runMatrix({
    ...options,
    cells,
    manifestDir: K_SWEEP_MANIFEST_DIR,
  });
}
