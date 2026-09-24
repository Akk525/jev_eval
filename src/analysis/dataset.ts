import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ADAPTIVE_EVAL_POLICY_PATH, ADAPTIVE_EVAL_TOOLSPACE_SIZE } from "../config/adaptive-eval.js";
import { discoverResultDirectories } from "./scaling-tables.js";
import type { ExperimentConfig } from "../types/config.js";
import type { RunRecord } from "../results/writer.js";

/**
 * Scientific controls that must match to merge dirs into one analysis dataset.
 * Architecture, N, topK, and routerOnly are row dimensions — not merge keys.
 * Router model is allowed to differ across architectures in a fair comparison.
 * There is no separate prompt-version field yet; agent pin + registry hash cover it.
 */
export interface AnalysisCompatibilityKey {
  datasetPath: string;
  datasetVersion: string;
  registryHash: string;
  pricingVersion: string;
  agentProvider: string;
  agentModel: string;
  agentTemperature: number;
  seed: number;
  tracing: string;
}

export interface StoredExperimentConfig extends ExperimentConfig {
  configHash: string;
  datasetVersion: string;
  registryHash: string;
  gitSha: string;
}

export interface AnalysisDirectoryLoad {
  directory: string;
  config: StoredExperimentConfig;
  runs: RunRecord[];
}

export interface NormalizedAttempt {
  source_directory: string;
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  router_only: boolean;
  dataset_path: string;
  dataset_version: string;
  registry_hash: string;
  pricing_version: string;
  agent_provider: string;
  agent_model: string;
  agent_temperature: number;
  router_provider: string | null;
  router_model: string | null;
  git_sha: string;
  config_hash: string;
  seed: number;
  tracing: string;
  repetitions_configured: number;
  concurrency: number;
  task_id: string;
  repetition: number;
  toolspace: readonly string[];
  candidates: readonly string[] | null;
  scores: Readonly<Record<string, number>> | null;
  top1_probability: number | null;
  confidence: number | null;
  router_input_tokens: number;
  router_output_tokens: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  priced_cost_usd: number;
  provider_reported_cost_usd: number | null;
  router_latency_ms: number | null;
  agent_latency_ms: number | null;
  recall_at_k: number | null;
  lenient_recall_at_k: number | null;
  selection_accuracy: number | null;
  execution_excluded: boolean;
  routing_excluded: boolean;
  execution_success: boolean;
  failure_code: string | null;
  infrastructure_reason: string | null;
}

export interface AnalysisDataset {
  version: 1;
  /** ISO timestamp when this artifact was built. Does not rewrite source dirs. */
  built_at: string;
  results_root: string;
  compatibility: AnalysisCompatibilityKey;
  source_directories: string[];
  /**
   * #45 adaptive routing summary tables.
   * `"present"` when adaptive-eval result dirs are in the results root; otherwise `"skipped"`.
   */
  m5_adaptive_tables: "skipped" | "present";
  m5_skip_reason: string | null;
  attempt_count: number;
  attempts: NormalizedAttempt[];
}

export class AnalysisDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisDatasetError";
  }
}

export const M5_SKIP_REASON =
  "M5 adaptive routing summary tables (#45) skipped: no adaptive-eval result directories (architecture=adaptive + policies/adaptive/v1.json) under the results root.";

export const M5_PRESENT_NOTE =
  "M5 adaptive routing summary tables (#45) available — regenerate with npm run analysis:adaptive -- --results <root>.";

/**
 * Build one normalized analysis dataset from immutable result directories.
 * Does not rewrite `runs.jsonl`. Fails loud when scientific controls disagree.
 */
export function buildAnalysisDataset(resultsRoot: string, now = () => new Date()): AnalysisDataset {
  const root = resolve(resultsRoot);
  const loads = discoverResultDirectories(root).map(loadAnalysisDirectory);
  return buildAnalysisDatasetFromLoads(loads, root, now);
}

export function buildAnalysisDatasetFromLoads(
  loads: readonly AnalysisDirectoryLoad[],
  resultsRoot = "",
  now = () => new Date(),
): AnalysisDataset {
  if (loads.length === 0) {
    throw new AnalysisDatasetError(`no result directories found under ${resultsRoot || "(loads)"}`);
  }

  const keys = loads.map((load) => compatibilityKey(load.config));
  const first = keys[0]!;
  for (let index = 1; index < keys.length; index += 1) {
    const other = keys[index]!;
    const mismatch = describeMismatch(first, other);
    if (mismatch !== null) {
      throw new AnalysisDatasetError(
        `incompatible result directories: ${loads[0]!.directory} vs ${loads[index]!.directory}: ${mismatch}`,
      );
    }
  }

  const attempts: NormalizedAttempt[] = [];
  for (const load of loads) {
    for (const run of load.runs) {
      attempts.push(normalizeAttempt(load.directory, load.config, run));
    }
  }

  const hasAdaptiveEval = loads.some((load) => isAdaptiveEvalDir(load.config));

  return {
    version: 1,
    built_at: now().toISOString(),
    results_root: resolve(resultsRoot || "."),
    compatibility: first,
    source_directories: loads.map((load) => load.directory).sort(),
    m5_adaptive_tables: hasAdaptiveEval ? "present" : "skipped",
    m5_skip_reason: hasAdaptiveEval ? null : M5_SKIP_REASON,
    attempt_count: attempts.length,
    attempts,
  };
}

export function analysisDatasetToJson(dataset: AnalysisDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

/** One JSON object per line — convenient for later figure generators. */
export function analysisDatasetToJsonl(dataset: AnalysisDataset): string {
  if (dataset.attempts.length === 0) return "";
  return `${dataset.attempts.map((attempt) => JSON.stringify(attempt)).join("\n")}\n`;
}

export function writeAnalysisDataset(
  dataset: AnalysisDataset,
  outDir: string,
): { jsonPath: string; jsonlPath: string; compatibilityPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "analysis-dataset.json");
  const jsonlPath = join(root, "attempts.jsonl");
  const compatibilityPath = join(root, "compatibility.json");
  writeFileSync(jsonPath, analysisDatasetToJson(dataset));
  writeFileSync(jsonlPath, analysisDatasetToJsonl(dataset));
  writeFileSync(
    compatibilityPath,
    `${JSON.stringify(
      {
        compatibility: dataset.compatibility,
        source_directories: dataset.source_directories,
        m5_adaptive_tables: dataset.m5_adaptive_tables,
        m5_skip_reason: dataset.m5_skip_reason,
        attempt_count: dataset.attempt_count,
      },
      null,
      2,
    )}\n`,
  );
  return { jsonPath, jsonlPath, compatibilityPath };
}

export function loadAnalysisDirectory(directory: string): AnalysisDirectoryLoad {
  const configPath = join(directory, "config.json");
  const runsPath = join(directory, "runs.jsonl");
  if (!existsSync(configPath) || !existsSync(runsPath)) {
    throw new AnalysisDatasetError(`missing config.json or runs.jsonl in ${directory}`);
  }
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Partial<StoredExperimentConfig> &
    ExperimentConfig;
  const config = requireStoredMetadata(directory, raw);
  const runs = readRunRecords(runsPath);
  return { directory, config, runs };
}

function requireStoredMetadata(
  directory: string,
  raw: Partial<StoredExperimentConfig> & ExperimentConfig,
): StoredExperimentConfig {
  const required = ["datasetVersion", "registryHash", "configHash", "gitSha"] as const;
  for (const field of required) {
    const value = raw[field];
    if (value === undefined || value === "") {
      throw new AnalysisDatasetError(`missing ${field} in ${join(directory, "config.json")}`);
    }
  }
  return raw as StoredExperimentConfig;
}

function compatibilityKey(config: StoredExperimentConfig): AnalysisCompatibilityKey {
  return {
    datasetPath: config.datasetPath,
    datasetVersion: String(config.datasetVersion),
    registryHash: String(config.registryHash),
    pricingVersion: config.pricingVersion,
    agentProvider: config.agent.provider,
    agentModel: config.agent.model,
    agentTemperature: config.agent.temperature,
    seed: config.seed,
    tracing: config.tracing,
  };
}

function describeMismatch(
  left: AnalysisCompatibilityKey,
  right: AnalysisCompatibilityKey,
): string | null {
  const fields: (keyof AnalysisCompatibilityKey)[] = [
    "datasetPath",
    "datasetVersion",
    "registryHash",
    "pricingVersion",
    "agentProvider",
    "agentModel",
    "agentTemperature",
    "seed",
    "tracing",
  ];
  const diffs = fields.filter((field) => left[field] !== right[field]);
  if (diffs.length === 0) return null;
  return diffs.map((field) => `${field}: ${String(left[field])} vs ${String(right[field])}`).join("; ");
}

function normalizeAttempt(
  directory: string,
  config: StoredExperimentConfig,
  run: RunRecord,
): NormalizedAttempt {
  return {
    source_directory: directory,
    architecture: config.architecture,
    toolspace_size: config.toolspaceSize,
    top_k: config.topK,
    router_only: config.routerOnly === true,
    dataset_path: config.datasetPath,
    dataset_version: String(config.datasetVersion),
    registry_hash: String(config.registryHash),
    pricing_version: config.pricingVersion,
    agent_provider: config.agent.provider,
    agent_model: config.agent.model,
    agent_temperature: config.agent.temperature,
    router_provider: config.router?.provider ?? null,
    router_model: config.router?.model ?? null,
    git_sha: String(config.gitSha),
    config_hash: String(config.configHash),
    seed: config.seed,
    tracing: config.tracing,
    repetitions_configured: config.repetitions,
    concurrency: config.concurrency,
    task_id: run.taskId,
    repetition: run.repetition,
    toolspace: run.toolspace,
    candidates: run.candidates,
    scores: run.scores,
    top1_probability: run.top1Probability,
    confidence: run.confidence,
    router_input_tokens: run.routerUsage.inputTokens,
    router_output_tokens: run.routerUsage.outputTokens,
    agent_input_tokens: run.agentUsage.inputTokens,
    agent_output_tokens: run.agentUsage.outputTokens,
    priced_cost_usd: run.pricedCostUsd,
    provider_reported_cost_usd: run.providerReportedCostUsd,
    router_latency_ms: run.routerLatencyMs,
    agent_latency_ms: run.agentLatencyMs,
    recall_at_k: run.recallAtK,
    lenient_recall_at_k: run.lenientRecallAtK,
    selection_accuracy: run.selectionAccuracy,
    execution_excluded: run.executionExcluded,
    routing_excluded: run.routingExcluded,
    execution_success: run.executionSuccess,
    failure_code: run.failureCode,
    infrastructure_reason: run.infrastructureReason,
  };
}

function readRunRecords(path: string): RunRecord[] {
  const text = readFileSync(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunRecord);
}

function isAdaptiveEvalDir(config: ExperimentConfig): boolean {
  return (
    config.architecture === "adaptive" &&
    config.toolspaceSize === ADAPTIVE_EVAL_TOOLSPACE_SIZE &&
    config.adaptivePolicyPath === ADAPTIVE_EVAL_POLICY_PATH &&
    config.routerOnly !== true
  );
}
