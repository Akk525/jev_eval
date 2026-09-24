import type { ExperimentConfig } from "../types/config.js";
import { SCALING_TOOLSPACE_SIZES, type ScalingToolspaceSize } from "../tools/toolspace.js";

/** Fixed top-k for routed M3 matrix cells (Jev and LLM). */
export const MATRIX_TOP_K = 5;

/** Recommended repetitions for final end-to-end live runs (BRIEF §23). Matrix cells stay at 1. */
export const FINAL_REPETITIONS = 3;

/** Scaling dataset for the N-matrix. Slice configs keep v0.1. */
export const MATRIX_DATASET_PATH = "datasets/v0.2/tasks.jsonl";

export const MATRIX_ARCHITECTURES = ["baseline", "jev", "llm"] as const;

export type MatrixArchitecture = (typeof MATRIX_ARCHITECTURES)[number];

export interface MatrixCell {
  architecture: MatrixArchitecture;
  toolspaceSize: ScalingToolspaceSize;
  /** Repo-relative path under configs/matrix/. */
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;
const LLM_ROUTER = { provider: "openai", model: "gpt-5.6-sol" } as const;

/** Filename stem for one matrix cell, e.g. `baseline-n25`, `jev-top5-n100`. */
export function matrixFileStem(architecture: MatrixArchitecture, n: ScalingToolspaceSize): string {
  if (architecture === "baseline") return `baseline-n${n}`;
  if (architecture === "jev") return `jev-top5-n${n}`;
  return `llm-top5-n${n}`;
}

export function matrixRelativePath(architecture: MatrixArchitecture, n: ScalingToolspaceSize): string {
  return `configs/matrix/${matrixFileStem(architecture, n)}.yaml`;
}

export function buildMatrixConfig(
  architecture: MatrixArchitecture,
  toolspaceSize: ScalingToolspaceSize,
): ExperimentConfig {
  if (architecture === "baseline") {
    return {
      architecture: "baseline",
      toolspaceSize,
      topK: null,
      datasetPath: MATRIX_DATASET_PATH,
      repetitions: 1,
      concurrency: 1,
      seed: 0,
      agent: { ...AGENT },
      router: null,
      pricingVersion: "v1",
      tracing: "noop",
      routerOnly: false,
    };
  }

  return {
    architecture,
    toolspaceSize,
    topK: MATRIX_TOP_K,
    datasetPath: MATRIX_DATASET_PATH,
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { ...AGENT },
    router: architecture === "jev" ? { ...JEV_ROUTER } : { ...LLM_ROUTER },
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
  };
}

/** Full 3 × 5 M3 matrix in stable architecture-then-N order. */
export function enumerateMatrixCells(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const architecture of MATRIX_ARCHITECTURES) {
    for (const toolspaceSize of SCALING_TOOLSPACE_SIZES) {
      cells.push({
        architecture,
        toolspaceSize,
        relativePath: matrixRelativePath(architecture, toolspaceSize),
        config: buildMatrixConfig(architecture, toolspaceSize),
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
