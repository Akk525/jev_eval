import type { ExperimentConfig } from "../types/config.js";
import { MATRIX_DATASET_PATH, renderMatrixYaml } from "./matrix.js";

/**
 * Engineering validation before the full M3 matrix.
 * Not a scientific sample — do not optimize policies against its numbers.
 */
export const DRESS_REHEARSAL_TOOLSPACE_SIZES = [5, 20, 50] as const;
export type DressRehearsalToolspaceSize = (typeof DRESS_REHEARSAL_TOOLSPACE_SIZES)[number];

export const DRESS_REHEARSAL_DATASET_PATH = MATRIX_DATASET_PATH;

/** First 50 tasks by ascending `task_NNNN` id from v0.2 (frozen subset). */
export const DRESS_REHEARSAL_TASK_COUNT = 50;

export const DRESS_REHEARSAL_TASK_SUBSET = {
  rule: "first 50 tasks by ascending task id from datasets/v0.2/tasks.jsonl",
  task_count: DRESS_REHEARSAL_TASK_COUNT,
  purpose: "engineering validation only — not for threshold or architecture fitting",
} as const;

export type DressRehearsalArchId = "baseline" | "jev_top1" | "jev_top5";

export interface DressRehearsalCell {
  id: DressRehearsalArchId;
  architecture: ExperimentConfig["architecture"];
  toolspaceSize: DressRehearsalToolspaceSize;
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;

export function dressRehearsalFileStem(
  id: DressRehearsalArchId,
  n: DressRehearsalToolspaceSize,
): string {
  if (id === "baseline") return `baseline-n${n}`;
  if (id === "jev_top1") return `jev-top1-n${n}`;
  return `jev-top5-n${n}`;
}

export function dressRehearsalRelativePath(
  id: DressRehearsalArchId,
  n: DressRehearsalToolspaceSize,
): string {
  return `configs/dress-rehearsal/${dressRehearsalFileStem(id, n)}.yaml`;
}

export function buildDressRehearsalConfig(
  id: DressRehearsalArchId,
  toolspaceSize: DressRehearsalToolspaceSize,
): ExperimentConfig {
  const base = {
    toolspaceSize,
    datasetPath: DRESS_REHEARSAL_DATASET_PATH,
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { ...AGENT },
    escalateRouter: null,
    adaptivePolicyPath: null,
    pricingVersion: "v1" as const,
    tracing: "noop" as const,
    routerOnly: false,
  };

  if (id === "baseline") {
    return {
      ...base,
      architecture: "baseline",
      topK: null,
      router: null,
    };
  }

  if (id === "jev_top1") {
    return {
      ...base,
      architecture: "jev",
      topK: 1,
      router: { ...JEV_ROUTER },
    };
  }

  return {
    ...base,
    architecture: "jev",
    topK: 5,
    router: { ...JEV_ROUTER },
  };
}

/** 3 architectures × 3 N values, architecture-then-N order. */
export function enumerateDressRehearsalCells(): DressRehearsalCell[] {
  const ids: DressRehearsalArchId[] = ["baseline", "jev_top1", "jev_top5"];
  const cells: DressRehearsalCell[] = [];
  for (const id of ids) {
    for (const toolspaceSize of DRESS_REHEARSAL_TOOLSPACE_SIZES) {
      const config = buildDressRehearsalConfig(id, toolspaceSize);
      cells.push({
        id,
        architecture: config.architecture,
        toolspaceSize,
        relativePath: dressRehearsalRelativePath(id, toolspaceSize),
        config,
      });
    }
  }
  return cells;
}

export { renderMatrixYaml as renderDressRehearsalYaml };
