import type { ExperimentConfig } from "../types/config.js";
import { renderMatrixYaml } from "./matrix.js";

/** Shared N with the #42 threshold-lock vertical slice (D13 source). */
export const ADAPTIVE_EVAL_TOOLSPACE_SIZE = 20;

/** Dataset shared with the locked policy source. Holdout is by taskId hash, not a new file. */
export const ADAPTIVE_EVAL_DATASET_PATH = "datasets/v0.1/tasks.jsonl";

export const ADAPTIVE_EVAL_POLICY_PATH = "policies/adaptive/v1.json";

/**
 * #42 development split used even FNV-1a taskId hash.
 * #44 evaluation uses the complement (odd hash) so thresholds and headlines stay disjoint.
 */
export const ADAPTIVE_EVAL_HOLDOUT_SPLIT = {
  rule: "odd FNV-1a taskId hash",
  complement_of: "even FNV-1a taskId hash (policies/adaptive/v1.json threshold_source)",
  threshold_source_dir: "results/2026-09-24T040823Z_jev_n20_k5_2e9e789ecba3",
} as const;

export type AdaptiveEvalCellId = "baseline" | "jev_top1" | "jev_top5" | "adaptive";

export interface AdaptiveEvalCell {
  id: AdaptiveEvalCellId;
  architecture: ExperimentConfig["architecture"];
  toolspaceSize: number;
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;
const LLM_ROUTER = { provider: "openai", model: "gpt-5.6-sol" } as const;

export function adaptiveEvalFileStem(id: AdaptiveEvalCellId): string {
  switch (id) {
    case "baseline":
      return `baseline-n${ADAPTIVE_EVAL_TOOLSPACE_SIZE}`;
    case "jev_top1":
      return `jev-top1-n${ADAPTIVE_EVAL_TOOLSPACE_SIZE}`;
    case "jev_top5":
      return `jev-top5-n${ADAPTIVE_EVAL_TOOLSPACE_SIZE}`;
    case "adaptive":
      return `adaptive-n${ADAPTIVE_EVAL_TOOLSPACE_SIZE}`;
  }
}

export function adaptiveEvalRelativePath(id: AdaptiveEvalCellId): string {
  return `configs/adaptive-eval/${adaptiveEvalFileStem(id)}.yaml`;
}

export function buildAdaptiveEvalConfig(id: AdaptiveEvalCellId): ExperimentConfig {
  const base = {
    toolspaceSize: ADAPTIVE_EVAL_TOOLSPACE_SIZE,
    datasetPath: ADAPTIVE_EVAL_DATASET_PATH,
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { ...AGENT },
    pricingVersion: "v1",
    tracing: "noop" as const,
    routerOnly: false,
  };

  if (id === "baseline") {
    return {
      ...base,
      architecture: "baseline",
      topK: null,
      router: null,
      escalateRouter: null,
      adaptivePolicyPath: null,
    };
  }

  if (id === "jev_top1") {
    return {
      ...base,
      architecture: "jev",
      topK: 1,
      router: { ...JEV_ROUTER },
      escalateRouter: null,
      adaptivePolicyPath: null,
    };
  }

  if (id === "jev_top5") {
    return {
      ...base,
      architecture: "jev",
      topK: 5,
      router: { ...JEV_ROUTER },
      escalateRouter: null,
      adaptivePolicyPath: null,
    };
  }

  return {
    ...base,
    architecture: "adaptive",
    topK: 5,
    router: { ...JEV_ROUTER },
    escalateRouter: { ...LLM_ROUTER },
    adaptivePolicyPath: ADAPTIVE_EVAL_POLICY_PATH,
  };
}

/** Fixed-k controls + adaptive, in comparison order. */
export function enumerateAdaptiveEvalCells(): AdaptiveEvalCell[] {
  const ids: AdaptiveEvalCellId[] = ["baseline", "jev_top1", "jev_top5", "adaptive"];
  return ids.map((id) => {
    const config = buildAdaptiveEvalConfig(id);
    return {
      id,
      architecture: config.architecture,
      toolspaceSize: ADAPTIVE_EVAL_TOOLSPACE_SIZE,
      relativePath: adaptiveEvalRelativePath(id),
      config,
    };
  });
}

export function renderAdaptiveEvalYaml(config: ExperimentConfig): string {
  const lines = renderMatrixYaml(config).trimEnd().split("\n");
  if (config.escalateRouter) {
    lines.push("escalateRouter:");
    lines.push(`  provider: ${config.escalateRouter.provider}`);
    lines.push(`  model: ${config.escalateRouter.model}`);
  } else {
    lines.push("escalateRouter: null");
  }
  if (config.adaptivePolicyPath) {
    lines.push(`adaptivePolicyPath: ${config.adaptivePolicyPath}`);
  } else {
    lines.push("adaptivePolicyPath: null");
  }
  lines.push("");
  return lines.join("\n");
}
