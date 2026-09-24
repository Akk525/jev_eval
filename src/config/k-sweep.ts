import type { ExperimentConfig } from "../types/config.js";
import { MATRIX_DATASET_PATH, renderMatrixYaml } from "./matrix.js";

/** M4 Jev top-k ablation values. */
export const K_SWEEP_TOP_KS = [1, 3, 5, 10] as const;

export type KSweepTopK = (typeof K_SWEEP_TOP_KS)[number];

/**
 * Fixed toolspace size for the M4 Jev k-sweep (D14; amends D12).
 * Chosen from M3 paired analysis: N=100 exhibits routing-coverage pressure,
 * downstream selection pressure, and context/cost separation simultaneously.
 */
export const K_SWEEP_TOOLSPACE_SIZE = 100 as const;

/** Stable cell ids for the frozen M4 ablation. */
export type KSweepCellId = "jev_k1_n100" | "jev_k3_n100" | "jev_k5_n100" | "jev_k10_n100";

export interface KSweepCell {
  id: KSweepCellId;
  topK: KSweepTopK;
  /** Repo-relative path under configs/k-sweep/. */
  relativePath: string;
  config: ExperimentConfig;
}

const AGENT = { provider: "openai", model: "gpt-5.6-sol", temperature: 0 } as const;
const JEV_ROUTER = { provider: "typesafe", model: "jev-1.13.0" } as const;

export function kSweepCellId(topK: KSweepTopK): KSweepCellId {
  return `jev_k${topK}_n${K_SWEEP_TOOLSPACE_SIZE}` as KSweepCellId;
}

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
    escalateRouter: null,
    adaptivePolicyPath: null,
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
  };
}

/** Jev k ∈ {1, 3, 5, 10} at fixed N=100, in ascending k order. */
export function enumerateKSweepCells(): KSweepCell[] {
  return K_SWEEP_TOP_KS.map((topK) => ({
    id: kSweepCellId(topK),
    topK,
    relativePath: kSweepRelativePath(topK),
    config: buildKSweepConfig(topK),
  }));
}

export { renderMatrixYaml as renderKSweepYaml };
