import type { ExperimentConfig } from "../types/config.js";
import { MATRIX_DATASET_PATH, renderMatrixYaml } from "./matrix.js";

/** M4 Jev top-k ablation values. */
export const K_SWEEP_TOP_KS = [1, 3, 5, 10] as const;

export type KSweepTopK = (typeof K_SWEEP_TOP_KS)[number];

/**
 * Fixed toolspace size for the M4 Jev k-sweep (D12).
 * Chosen from the formal M3 sizes so k=10 fits and N stays mid-range.
 */
export const K_SWEEP_TOOLSPACE_SIZE = 25 as const;

export interface KSweepCell {
  topK: KSweepTopK;
  /** Repo-relative path under configs/k-sweep/. */
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;

export function kSweepFileStem(topK: KSweepTopK): string {
  return `jev-top${topK}-n${K_SWEEP_TOOLSPACE_SIZE}`;
}

export function kSweepRelativePath(topK: KSweepTopK): string {
  return `configs/k-sweep/${kSweepFileStem(topK)}.yaml`;
}

export function buildKSweepConfig(topK: KSweepTopK): ExperimentConfig {
  return {
    architecture: "jev",
    toolspaceSize: K_SWEEP_TOOLSPACE_SIZE,
    topK,
    datasetPath: MATRIX_DATASET_PATH,
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { ...AGENT },
    router: { ...JEV_ROUTER },
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
  };
}

/** Jev k ∈ {1, 3, 5, 10} at fixed N, in ascending k order. */
export function enumerateKSweepCells(): KSweepCell[] {
  return K_SWEEP_TOP_KS.map((topK) => ({
    topK,
    relativePath: kSweepRelativePath(topK),
    config: buildKSweepConfig(topK),
  }));
}

export { renderMatrixYaml as renderKSweepYaml };
