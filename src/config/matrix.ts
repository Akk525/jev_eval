import type { ExperimentConfig } from "../types/config.js";
import { SCALING_TOOLSPACE_SIZES, type ScalingToolspaceSize } from "../tools/toolspace.js";

/**
 * M3 comparison cells. LLM top-5 remains implemented and available under
 * `configs/archive/llm-top5-matrix/` but is not part of this matrix.
 */
export const MATRIX_CELL_IDS = ["baseline", "jev_top1", "jev_top5"] as const;
export type MatrixCellId = (typeof MATRIX_CELL_IDS)[number];

/** @deprecated Use MATRIX_CELL_IDS. Kept as alias for older imports during transition. */
export const MATRIX_ARCHITECTURES = MATRIX_CELL_IDS;

/** Fixed top-k for Jev top-5 cells. */
export const MATRIX_TOP_K = 5;

/** Top-k for the Jev top-1 control. */
export const MATRIX_TOP_K_CONTROL = 1;

/** Recommended repetitions for final end-to-end live runs (BRIEF §23). Matrix cells stay at 1. */
export const FINAL_REPETITIONS = 3;

/** Scaling dataset for the N-matrix. Slice configs keep v0.1. */
export const MATRIX_DATASET_PATH = "datasets/v0.2/tasks.jsonl";

export type MatrixArchitecture = "baseline" | "jev";

export interface MatrixCell {
  /** Stable cell id (e.g. baseline / jev_top1 / jev_top5 / adaptive). */
  id: string;
  architecture: string;
  toolspaceSize: number;
  /** Repo-relative path under configs/. */
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;

/** Filename stem for one matrix cell, e.g. `baseline-n25`, `jev-top1-n100`. */
export function matrixFileStem(id: MatrixCellId, n: ScalingToolspaceSize): string {
  if (id === "baseline") return `baseline-n${n}`;
  if (id === "jev_top1") return `jev-top1-n${n}`;
  return `jev-top5-n${n}`;
}

export function matrixRelativePath(id: MatrixCellId, n: ScalingToolspaceSize): string {
  return `configs/matrix/${matrixFileStem(id, n)}.yaml`;
}

export function buildMatrixConfig(id: MatrixCellId, toolspaceSize: ScalingToolspaceSize): ExperimentConfig {
  const base = {
    toolspaceSize,
    datasetPath: MATRIX_DATASET_PATH,
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
      topK: MATRIX_TOP_K_CONTROL,
      router: { ...JEV_ROUTER },
    };
  }

  return {
    ...base,
    architecture: "jev",
    topK: MATRIX_TOP_K,
    router: { ...JEV_ROUTER },
  };
}

/** Full 3 × 5 M3 matrix in stable cell-id-then-N order. */
export function enumerateMatrixCells(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const id of MATRIX_CELL_IDS) {
    for (const toolspaceSize of SCALING_TOOLSPACE_SIZES) {
      const config = buildMatrixConfig(id, toolspaceSize);
      cells.push({
        id,
        architecture: config.architecture,
        toolspaceSize,
        relativePath: matrixRelativePath(id, toolspaceSize),
        config,
      });
    }
  }
  return cells;
}

/** Stable YAML matching the hand-written slice configs. */
export function renderMatrixYaml(config: ExperimentConfig): string {
  const lines: string[] = [
    `architecture: ${config.architecture}`,
    `toolspaceSize: ${config.toolspaceSize}`,
    `topK: ${config.topK === null ? "null" : String(config.topK)}`,
    `datasetPath: ${config.datasetPath}`,
    `repetitions: ${config.repetitions}`,
    `concurrency: ${config.concurrency}`,
    `seed: ${config.seed}`,
    "agent:",
    `  provider: ${config.agent.provider}`,
    `  model: ${config.agent.model}`,
    `  temperature: ${config.agent.temperature}`,
  ];

  if (config.router === null) {
    lines.push("router: null");
  } else {
    lines.push("router:");
    lines.push(`  provider: ${config.router.provider}`);
    lines.push(`  model: ${config.router.model}`);
  }

  lines.push(`pricingVersion: ${config.pricingVersion}`);
  lines.push(`tracing: ${config.tracing}`);
  lines.push("");
  return lines.join("\n");
}
