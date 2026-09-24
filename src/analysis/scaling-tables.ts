import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { aggregateRuns, type AggregateRun } from "../metrics/aggregate.js";
import { summarizeSamples, type LatencySummary, type SampleSummary } from "../metrics/metrics.js";
import type { ExperimentConfig } from "../types/config.js";
import type { FailureCode } from "../types/trace.js";

const FAILURE_CODES = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"] as const;

export type FailureTaxonomy = Record<(typeof FAILURE_CODES)[number] | "none", number>;

export interface ScalingRun extends AggregateRun {
  selectionAccuracy: number | null;
}

export interface ResultDirectoryLoad {
  directory: string;
  config: ExperimentConfig & { configHash?: string };
  runs: ScalingRun[];
}

export interface ScalingTableRow {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  router_only: boolean;
  source_directories: string[];
  attempts: number;
  r0_attempts: number;
  infrastructure_failure_rate: number | null;
  routing_scored: number;
  execution_scored: number;
  execution_success_rate: number | null;
  execution_success_rate_stats: SampleSummary;
  selection_scored: number;
  selection_accuracy: number | null;
  selection_accuracy_stats: SampleSummary;
  recall_at_k: number | null;
  recall_at_k_stats: SampleSummary;
  router_input_tokens: number;
  router_output_tokens: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  priced_cost_usd: number;
  router_latency_ms: LatencySummary;
  agent_latency_ms: LatencySummary;
  failure_taxonomy: FailureTaxonomy;
}

export interface ScalingTables {
  /** One row per architecture × N. Incompatible topK / routerOnly within a cell fails loud. */
  rows: ScalingTableRow[];
}

export class ScalingTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScalingTableError";
  }
}

/** Discover immediate child dirs that look like immutable result epochs. */
export function discoverResultDirectories(resultsRoot: string): string[] {
  const root = resolve(resultsRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => {
      if (!statSync(path).isDirectory()) return false;
      if (nameOf(path) === "_matrix") return false;
      return existsSync(join(path, "config.json")) && existsSync(join(path, "runs.jsonl"));
    })
    .sort();
}

export function loadResultDirectory(directory: string): ResultDirectoryLoad {
  const configPath = join(directory, "config.json");
  const runsPath = join(directory, "runs.jsonl");
  if (!existsSync(configPath) || !existsSync(runsPath)) {
    throw new ScalingTableError(`missing config.json or runs.jsonl in ${directory}`);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as ExperimentConfig & {
    configHash?: string;
  };
  const runs = readRunsJsonl(runsPath);
  return { directory, config, runs };
}

/**
 * Build architecture × N comparison rows from result directories.
 * Recomputes aggregates from `runs.jsonl` only (ignores stored summary.json).
 * Keeps R0 in the failure taxonomy and infrastructure rate; quality rates exclude R0.
 */
export function buildScalingTables(resultsRoot: string): ScalingTables {
  const directories = discoverResultDirectories(resultsRoot).map(loadResultDirectory);
  return buildScalingTablesFromLoads(directories);
}

export function buildScalingTablesFromLoads(directories: readonly ResultDirectoryLoad[]): ScalingTables {
  const groups = new Map<string, ResultDirectoryLoad[]>();
  for (const loaded of directories) {
    const key = groupKey(loaded.config);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [loaded]);
    else bucket.push(loaded);
  }

  const rows: ScalingTableRow[] = [];
  for (const bucket of groups.values()) {
    assertCompatibleGroup(bucket);
    rows.push(rowFromGroup(bucket));
  }

  rows.sort((left, right) => {
    if (left.architecture !== right.architecture) {
      return left.architecture.localeCompare(right.architecture);
    }
    if (left.toolspace_size !== right.toolspace_size) {
      return left.toolspace_size - right.toolspace_size;
    }
    if (left.router_only !== right.router_only) return left.router_only ? 1 : -1;
    const leftK = left.top_k ?? -1;
    const rightK = right.top_k ?? -1;
    return leftK - rightK;
  });

  return { rows };
}

export function scalingTablesToJson(tables: ScalingTables): string {
  return `${JSON.stringify(tables, null, 2)}\n`;
}

export function scalingTablesToCsv(tables: ScalingTables): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "router_only",
    "source_directories",
    "attempts",
    "r0_attempts",
    "infrastructure_failure_rate",
    "routing_scored",
    "execution_scored",
    "execution_success_rate",
    "execution_success_rate_mean",
    "execution_success_rate_stddev",
    "execution_success_rate_ci95_low",
    "execution_success_rate_ci95_high",
    "selection_scored",
    "selection_accuracy",
    "recall_at_k",
    "recall_at_k_mean",
    "recall_at_k_stddev",
    "recall_at_k_ci95_low",
    "recall_at_k_ci95_high",
    "router_input_tokens",
    "router_output_tokens",
    "agent_input_tokens",
    "agent_output_tokens",
    "priced_cost_usd",
    "router_latency_ms_mean",
    "router_latency_ms_p50",
    "router_latency_ms_p95",
    "agent_latency_ms_mean",
    "agent_latency_ms_p50",
    "agent_latency_ms_p95",
    "failures_R0",
    "failures_R1",
    "failures_R2",
    "failures_R3",
    "failures_R4",
    "failures_R5",
    "failures_R6",
    "failures_none",
  ];

  const lines = [headers.join(",")];
  for (const row of tables.rows) {
    lines.push(
      [
        row.architecture,
        row.toolspace_size,
        row.top_k === null ? "" : row.top_k,
        row.router_only,
        row.source_directories.map(nameOf).join("|"),
        row.attempts,
        row.r0_attempts,
        csvNumber(row.infrastructure_failure_rate),
        row.routing_scored,
        row.execution_scored,
        csvNumber(row.execution_success_rate),
        csvNumber(row.execution_success_rate_stats.mean),
        csvNumber(row.execution_success_rate_stats.stddev),
        csvNumber(row.execution_success_rate_stats.ci95Low),
        csvNumber(row.execution_success_rate_stats.ci95High),
        row.selection_scored,
        csvNumber(row.selection_accuracy),
        csvNumber(row.recall_at_k),
        csvNumber(row.recall_at_k_stats.mean),
        csvNumber(row.recall_at_k_stats.stddev),
        csvNumber(row.recall_at_k_stats.ci95Low),
        csvNumber(row.recall_at_k_stats.ci95High),
        row.router_input_tokens,
        row.router_output_tokens,
        row.agent_input_tokens,
        row.agent_output_tokens,
        csvNumber(row.priced_cost_usd),
        csvNumber(row.router_latency_ms.mean),
        csvNumber(row.router_latency_ms.p50),
        csvNumber(row.router_latency_ms.p95),
        csvNumber(row.agent_latency_ms.mean),
        csvNumber(row.agent_latency_ms.p50),
        csvNumber(row.agent_latency_ms.p95),
        row.failure_taxonomy.R0,
        row.failure_taxonomy.R1,
        row.failure_taxonomy.R2,
        row.failure_taxonomy.R3,
        row.failure_taxonomy.R4,
        row.failure_taxonomy.R5,
        row.failure_taxonomy.R6,
        row.failure_taxonomy.none,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function rowFromGroup(group: readonly ResultDirectoryLoad[]): ScalingTableRow {
  const config = group[0]!.config;
  const runs = group.flatMap((item) => item.runs);
  const summary = aggregateRuns(runs);
  const selection = runs
    .map((run) => run.selectionAccuracy)
    .filter((value): value is number => value !== null);
  const taxonomy = failureTaxonomy(runs);

  return {
    architecture: config.architecture,
    toolspace_size: config.toolspaceSize,
    top_k: config.topK,
    router_only: config.routerOnly === true,
    source_directories: group.map((item) => item.directory).sort(),
    attempts: summary.attempts,
    r0_attempts: summary.r0_attempts,
    infrastructure_failure_rate:
      summary.attempts === 0 ? null : summary.r0_attempts / summary.attempts,
    routing_scored: summary.routing_scored,
    execution_scored: summary.execution_scored,
    execution_success_rate: summary.execution_success_rate,
    execution_success_rate_stats: summary.execution_success_rate_stats,
    selection_scored: selection.length,
    selection_accuracy: selection.length === 0 ? null : mean(selection),
    selection_accuracy_stats: summarizeSamples(selection),
    recall_at_k: summary.recall_at_k,
    recall_at_k_stats: summary.recall_at_k_stats,
    router_input_tokens: summary.router_input_tokens,
    router_output_tokens: summary.router_output_tokens,
    agent_input_tokens: summary.agent_input_tokens,
    agent_output_tokens: summary.agent_output_tokens,
    priced_cost_usd: summary.priced_cost_usd,
    router_latency_ms: summary.router_latency_ms,
    agent_latency_ms: summary.agent_latency_ms,
    failure_taxonomy: taxonomy,
  };
}

function failureTaxonomy(runs: readonly ScalingRun[]): FailureTaxonomy {
  const taxonomy: FailureTaxonomy = {
    R0: 0,
    R1: 0,
    R2: 0,
    R3: 0,
    R4: 0,
    R5: 0,
    R6: 0,
    none: 0,
  };
  for (const run of runs) {
    const code = run.failureCode;
    if (code === null) taxonomy.none += 1;
    else if (isFailureCode(code)) taxonomy[code] += 1;
    else taxonomy.none += 1;
  }
  return taxonomy;
}

function isFailureCode(code: string): code is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(code);
}

function assertCompatibleGroup(group: readonly ResultDirectoryLoad[]): void {
  const first = group[0]!.config;
  for (const item of group.slice(1)) {
    const config = item.config;
    if (config.architecture !== first.architecture) {
      throw new ScalingTableError("architecture mismatch within architecture×N group");
    }
    if (config.toolspaceSize !== first.toolspaceSize) {
      throw new ScalingTableError("toolspaceSize mismatch within architecture×N group");
    }
    if (config.topK !== first.topK) {
      throw new ScalingTableError(
        `topK mismatch for ${first.architecture} n=${first.toolspaceSize}: ${first.topK} vs ${config.topK}`,
      );
    }
    if ((config.routerOnly === true) !== (first.routerOnly === true)) {
      throw new ScalingTableError(
        `routerOnly mismatch for ${first.architecture} n=${first.toolspaceSize}; do not mix router-only and full-agent epochs`,
      );
    }
  }
}

function groupKey(config: ExperimentConfig): string {
  return `${config.architecture}::${config.toolspaceSize}`;
}

function readRunsJsonl(path: string): ScalingRun[] {
  const text = readFileSync(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const raw = JSON.parse(line) as AggregateRun & { selectionAccuracy?: number | null };
      return {
        ...raw,
        selectionAccuracy: raw.selectionAccuracy ?? null,
      };
    });
}

function nameOf(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
