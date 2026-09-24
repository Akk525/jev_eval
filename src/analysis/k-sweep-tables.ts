import { aggregateRuns } from "../metrics/aggregate.js";
import { summarizeSamples, type LatencySummary, type SampleSummary } from "../metrics/metrics.js";
import {
  K_SWEEP_TOOLSPACE_SIZE,
  K_SWEEP_TOP_KS,
  type KSweepTopK,
} from "../config/k-sweep.js";
import {
  discoverResultDirectories,
  loadResultDirectory,
  type ResultDirectoryLoad,
  type ScalingRun,
} from "./scaling-tables.js";

export interface KSweepTableRow {
  architecture: "jev";
  toolspace_size: number;
  top_k: number;
  source_directories: string[];
  attempts: number;
  r0_attempts: number;
  infrastructure_failure_rate: number | null;
  routing_scored: number;
  /** Strict / primary Recall@k mean over routing-scored attempts. */
  recall_at_k: number | null;
  recall_at_k_stats: SampleSummary;
  selection_scored: number;
  selection_accuracy: number | null;
  selection_accuracy_stats: SampleSummary;
  execution_scored: number;
  execution_success_rate: number | null;
  execution_success_rate_stats: SampleSummary;
  /** Mean |candidates| when routing produced a candidate list. */
  mean_candidate_count: number | null;
  candidate_count_stats: SampleSummary;
  router_input_tokens: number;
  router_output_tokens: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  priced_cost_usd: number;
  router_latency_ms: LatencySummary;
  agent_latency_ms: LatencySummary;
}

export interface KSweepTables {
  /** One row per k, ascending. Recomputed from runs.jsonl only. */
  rows: KSweepTableRow[];
}

export class KSweepTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KSweepTableError";
  }
}

/**
 * Aggregate M4 Jev k-sweep result directories by topK.
 * Ignores non-Jev dirs and dirs whose N is not the locked k-sweep N.
 */
export function buildKSweepTables(resultsRoot: string): KSweepTables {
  const loads = discoverResultDirectories(resultsRoot)
    .map(loadResultDirectory)
    .filter(isKSweepDirectory);
  return buildKSweepTablesFromLoads(loads);
}

export function buildKSweepTablesFromLoads(directories: readonly ResultDirectoryLoad[]): KSweepTables {
  const groups = new Map<number, ResultDirectoryLoad[]>();
  for (const loaded of directories) {
    if (!isKSweepDirectory(loaded)) continue;
    const topK = loaded.config.topK as number;
    const bucket = groups.get(topK);
    if (bucket === undefined) groups.set(topK, [loaded]);
    else bucket.push(loaded);
  }

  const rows: KSweepTableRow[] = [];
  for (const topK of K_SWEEP_TOP_KS) {
    const bucket = groups.get(topK);
    if (bucket === undefined) continue;
    rows.push(rowFromGroup(topK, bucket));
  }

  // Include any unexpected k values after the canonical set (fail soft; keep regenerable).
  for (const [topK, bucket] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if ((K_SWEEP_TOP_KS as readonly number[]).includes(topK)) continue;
    rows.push(rowFromGroup(topK, bucket));
  }

  return { rows };
}

export function kSweepTablesToJson(tables: KSweepTables): string {
  return `${JSON.stringify(tables, null, 2)}\n`;
}

export function kSweepTablesToCsv(tables: KSweepTables): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "source_directories",
    "attempts",
    "r0_attempts",
    "infrastructure_failure_rate",
    "routing_scored",
    "recall_at_k",
    "selection_accuracy",
    "execution_success_rate",
    "mean_candidate_count",
    "router_input_tokens",
    "agent_input_tokens",
    "priced_cost_usd",
    "router_latency_ms_mean",
    "agent_latency_ms_mean",
  ];
  const lines = [headers.join(",")];
  for (const row of tables.rows) {
    lines.push(
      [
        row.architecture,
        row.toolspace_size,
        row.top_k,
        row.source_directories.map(nameOf).join("|"),
        row.attempts,
        row.r0_attempts,
        csvNumber(row.infrastructure_failure_rate),
        row.routing_scored,
        csvNumber(row.recall_at_k),
        csvNumber(row.selection_accuracy),
        csvNumber(row.execution_success_rate),
        csvNumber(row.mean_candidate_count),
        row.router_input_tokens,
        row.agent_input_tokens,
        csvNumber(row.priced_cost_usd),
        csvNumber(row.router_latency_ms.mean),
        csvNumber(row.agent_latency_ms.mean),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function isKSweepDirectory(loaded: ResultDirectoryLoad): boolean {
  const { config } = loaded;
  return (
    config.architecture === "jev" &&
    config.toolspaceSize === K_SWEEP_TOOLSPACE_SIZE &&
    config.topK !== null &&
    config.routerOnly !== true
  );
}

function rowFromGroup(topK: number, group: readonly ResultDirectoryLoad[]): KSweepTableRow {
  const runs = group.flatMap((item) => item.runs);
  const summary = aggregateRuns(runs);
  const selection = runs
    .map((run) => run.selectionAccuracy)
    .filter((value): value is number => value !== null);
  const candidateCounts = runs
    .map((run) => candidatesLength(run))
    .filter((value): value is number => value !== null);
  const candidateStats = summarizeSamples(candidateCounts);

  return {
    architecture: "jev",
    toolspace_size: K_SWEEP_TOOLSPACE_SIZE,
    top_k: topK,
    source_directories: group.map((item) => item.directory).sort(),
    attempts: summary.attempts,
    r0_attempts: summary.r0_attempts,
    infrastructure_failure_rate:
      summary.attempts === 0 ? null : summary.r0_attempts / summary.attempts,
    routing_scored: summary.routing_scored,
    recall_at_k: summary.recall_at_k,
    recall_at_k_stats: summary.recall_at_k_stats,
    selection_scored: selection.length,
    selection_accuracy: selection.length === 0 ? null : mean(selection),
    selection_accuracy_stats: summarizeSamples(selection),
    execution_scored: summary.execution_scored,
    execution_success_rate: summary.execution_success_rate,
    execution_success_rate_stats: summary.execution_success_rate_stats,
    mean_candidate_count: candidateStats.mean,
    candidate_count_stats: candidateStats,
    router_input_tokens: summary.router_input_tokens,
    router_output_tokens: summary.router_output_tokens,
    agent_input_tokens: summary.agent_input_tokens,
    agent_output_tokens: summary.agent_output_tokens,
    priced_cost_usd: summary.priced_cost_usd,
    router_latency_ms: summary.router_latency_ms,
    agent_latency_ms: summary.agent_latency_ms,
  };
}

function candidatesLength(run: ScalingRun): number | null {
  if (run.candidates === null) return null;
  return run.candidates.length;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function nameOf(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

export type { KSweepTopK };
