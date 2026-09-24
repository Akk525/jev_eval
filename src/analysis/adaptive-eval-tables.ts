import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { aggregateRuns } from "../metrics/aggregate.js";
import { summarizeSamples, type LatencySummary, type SampleSummary } from "../metrics/metrics.js";
import {
  ADAPTIVE_EVAL_HOLDOUT_SPLIT,
  ADAPTIVE_EVAL_POLICY_PATH,
  ADAPTIVE_EVAL_TOOLSPACE_SIZE,
  type AdaptiveEvalCellId,
} from "../config/adaptive-eval.js";
import { ADAPTIVE_EVAL_MANIFEST_DIR } from "../eval/runner/adaptive-eval.js";
import {
  discoverResultDirectories,
  loadResultDirectory,
  type FailureTaxonomy,
  type ResultDirectoryLoad,
  type ScalingRun,
} from "./scaling-tables.js";

const FAILURE_CODES = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"] as const;

export interface AdaptiveEvalRun extends ScalingRun {
  adaptiveBranch?: "high" | "medium" | "low" | null;
  adaptiveEscalationTarget?: "llm_topk" | null;
  adaptiveSelectedK?: number | null;
}

export interface AdaptiveEvalTableRow {
  cell_id: AdaptiveEvalCellId;
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  source_directories: string[];
  attempts: number;
  r0_attempts: number;
  infrastructure_failure_rate: number | null;
  routing_scored: number;
  recall_at_k: number | null;
  recall_at_k_stats: SampleSummary;
  selection_scored: number;
  selection_accuracy: number | null;
  selection_accuracy_stats: SampleSummary;
  execution_scored: number;
  execution_success_rate: number | null;
  execution_success_rate_stats: SampleSummary;
  mean_candidate_count: number | null;
  router_input_tokens: number;
  router_output_tokens: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  priced_cost_usd: number;
  router_latency_ms: LatencySummary;
  agent_latency_ms: LatencySummary;
  failure_taxonomy: FailureTaxonomy;
  /** Fraction of attempts that escalated to llm_topk. Null for non-adaptive rows. */
  escalation_frequency: number | null;
  branch_counts: { high: number; medium: number; low: number } | null;
  mean_selected_k: number | null;
}

export interface AdaptiveEvalTables {
  policy_path: string;
  /** Manifest used to scope dirs (avoids merging older same-N/k slice runs). Null when falling back to a full scan. */
  source_manifest: string | null;
  held_out_split: typeof ADAPTIVE_EVAL_HOLDOUT_SPLIT & {
    note: string;
  };
  rows: AdaptiveEvalTableRow[];
}

export interface AdaptiveEvalTablesOptions {
  /** Prefer this `_adaptive-eval/<timestamp>.json` when several manifests exist. */
  timestamp?: string;
}

export class AdaptiveEvalTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdaptiveEvalTableError";
  }
}

/**
 * Aggregate #44 adaptive-vs-fixed-k result directories at the locked N.
 * Prefers directories listed in `_adaptive-eval/` manifests so older jev_n20_k5
 * vertical-slice runs are not merged into the comparison.
 */
export function buildAdaptiveEvalTables(
  resultsRoot: string,
  options: AdaptiveEvalTablesOptions = {},
): AdaptiveEvalTables {
  const discovered = discoverAdaptiveEvalLoads(resolve(resultsRoot), options.timestamp);
  const tables = buildAdaptiveEvalTablesFromLoads(discovered.loads);
  return { ...tables, source_manifest: discovered.manifestPath };
}

export function buildAdaptiveEvalTablesFromLoads(
  directories: readonly ResultDirectoryLoad[],
): AdaptiveEvalTables {
  const byId = new Map<AdaptiveEvalCellId, ResultDirectoryLoad[]>();
  for (const loaded of directories) {
    if (!isAdaptiveEvalDirectory(loaded)) continue;
    const id = cellIdOf(loaded);
    if (id === null) continue;
    const bucket = byId.get(id);
    if (bucket === undefined) byId.set(id, [loaded]);
    else bucket.push(loaded);
  }

  const order: AdaptiveEvalCellId[] = ["baseline", "jev_top1", "jev_top5", "adaptive"];
  const rows: AdaptiveEvalTableRow[] = [];
  for (const id of order) {
    const bucket = byId.get(id);
    if (bucket === undefined) continue;
    rows.push(rowFromGroup(id, bucket));
  }

  return {
    policy_path: ADAPTIVE_EVAL_POLICY_PATH,
    source_manifest: null,
    held_out_split: {
      ...ADAPTIVE_EVAL_HOLDOUT_SPLIT,
      note: "Evaluation tasks must use the odd-hash holdout; #42 thresholds used the even-hash development split of the cited directory.",
    },
    rows,
  };
}

/**
 * Prefer completed cell directories from `_adaptive-eval/<timestamp>.json`.
 * Falls back to scanning the results root when no usable manifest exists.
 */
export function discoverAdaptiveEvalLoads(
  resultsRoot: string,
  timestamp?: string,
): { loads: ResultDirectoryLoad[]; manifestPath: string | null } {
  const root = resolve(resultsRoot);
  const manifestPath = selectAdaptiveEvalManifest(root, timestamp);
  if (manifestPath !== null) {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      cells?: Array<{ status?: string; directory?: string | null }>;
    };
    const dirs = (raw.cells ?? [])
      .filter((cell) => cell.status === "completed" && typeof cell.directory === "string")
      .map((cell) => cell.directory as string);
    if (dirs.length === 0) {
      throw new AdaptiveEvalTableError(
        `adaptive-eval manifest ${manifestPath} has no completed cell directories`,
      );
    }
    return { loads: dirs.map(loadResultDirectory), manifestPath };
  }

  return {
    loads: discoverResultDirectories(root).map(loadResultDirectory).filter(isAdaptiveEvalDirectory),
    manifestPath: null,
  };
}

export function selectAdaptiveEvalManifest(resultsRoot: string, timestamp?: string): string | null {
  const dir = join(resolve(resultsRoot), ADAPTIVE_EVAL_MANIFEST_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;

  if (timestamp !== undefined) {
    const path = join(dir, `${timestamp}.json`);
    if (!existsSync(path)) {
      throw new AdaptiveEvalTableError(`adaptive-eval manifest not found: ${path}`);
    }
    return path;
  }

  const manifests = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name))
    .sort();
  return manifests.length === 0 ? null : manifests[manifests.length - 1]!;
}

export function adaptiveEvalTablesToJson(tables: AdaptiveEvalTables): string {
  return `${JSON.stringify(tables, null, 2)}\n`;
}

export function adaptiveEvalTablesToCsv(tables: AdaptiveEvalTables): string {
  const headers = [
    "cell_id",
    "architecture",
    "toolspace_size",
    "top_k",
    "attempts",
    "execution_success_rate",
    "recall_at_k",
    "selection_accuracy",
    "priced_cost_usd",
    "router_input_tokens",
    "agent_input_tokens",
    "router_latency_ms_mean",
    "agent_latency_ms_mean",
    "escalation_frequency",
    "mean_selected_k",
    "branch_high",
    "branch_medium",
    "branch_low",
    "r0_attempts",
  ];
  const lines = [headers.join(",")];
  for (const row of tables.rows) {
    lines.push(
      [
        row.cell_id,
        row.architecture,
        row.toolspace_size,
        row.top_k ?? "",
        row.attempts,
        csvNumber(row.execution_success_rate),
        csvNumber(row.recall_at_k),
        csvNumber(row.selection_accuracy),
        csvNumber(row.priced_cost_usd),
        row.router_input_tokens,
        row.agent_input_tokens,
        csvNumber(row.router_latency_ms.mean),
        csvNumber(row.agent_latency_ms.mean),
        csvNumber(row.escalation_frequency),
        csvNumber(row.mean_selected_k),
        row.branch_counts?.high ?? "",
        row.branch_counts?.medium ?? "",
        row.branch_counts?.low ?? "",
        row.r0_attempts,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function isAdaptiveEvalDirectory(loaded: ResultDirectoryLoad): boolean {
  const { config } = loaded;
  if (config.toolspaceSize !== ADAPTIVE_EVAL_TOOLSPACE_SIZE) return false;
  if (config.routerOnly === true) return false;
  if (config.datasetPath !== "datasets/v0.1/tasks.jsonl") return false;
  if (config.architecture === "baseline" && config.topK === null) return true;
  if (config.architecture === "jev" && (config.topK === 1 || config.topK === 5)) return true;
  if (
    config.architecture === "adaptive" &&
    config.topK === 5 &&
    config.adaptivePolicyPath === ADAPTIVE_EVAL_POLICY_PATH
  ) {
    return true;
  }
  return false;
}

function cellIdOf(loaded: ResultDirectoryLoad): AdaptiveEvalCellId | null {
  const { config } = loaded;
  if (config.architecture === "baseline") return "baseline";
  if (config.architecture === "adaptive") return "adaptive";
  if (config.architecture === "jev" && config.topK === 1) return "jev_top1";
  if (config.architecture === "jev" && config.topK === 5) return "jev_top5";
  return null;
}

function rowFromGroup(id: AdaptiveEvalCellId, group: readonly ResultDirectoryLoad[]): AdaptiveEvalTableRow {
  const runs = group.flatMap((item) => item.runs) as AdaptiveEvalRun[];
  const summary = aggregateRuns(runs);
  const selection = runs
    .map((run) => run.selectionAccuracy)
    .filter((value): value is number => value !== null);
  const candidateCounts = runs
    .map((run) => (run.candidates === null ? null : run.candidates.length))
    .filter((value): value is number => value !== null);

  const adaptive = id === "adaptive";
  const escalations = adaptive
    ? runs.filter((run) => run.adaptiveEscalationTarget === "llm_topk").length
    : 0;
  const branch_counts = adaptive
    ? {
        high: runs.filter((run) => run.adaptiveBranch === "high").length,
        medium: runs.filter((run) => run.adaptiveBranch === "medium").length,
        low: runs.filter((run) => run.adaptiveBranch === "low").length,
      }
    : null;
  const selectedKs = adaptive
    ? runs
        .map((run) => run.adaptiveSelectedK)
        .filter((value): value is number => value !== null && value !== undefined)
    : [];

  return {
    cell_id: id,
    architecture: group[0]!.config.architecture,
    toolspace_size: ADAPTIVE_EVAL_TOOLSPACE_SIZE,
    top_k: group[0]!.config.topK,
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
    mean_candidate_count: summarizeSamples(candidateCounts).mean,
    router_input_tokens: summary.router_input_tokens,
    router_output_tokens: summary.router_output_tokens,
    agent_input_tokens: summary.agent_input_tokens,
    agent_output_tokens: summary.agent_output_tokens,
    priced_cost_usd: summary.priced_cost_usd,
    router_latency_ms: summary.router_latency_ms,
    agent_latency_ms: summary.agent_latency_ms,
    failure_taxonomy: failureTaxonomy(runs),
    escalation_frequency: adaptive ? (runs.length === 0 ? null : escalations / runs.length) : null,
    branch_counts,
    mean_selected_k: selectedKs.length === 0 ? null : mean(selectedKs),
  };
}

function failureTaxonomy(runs: readonly AdaptiveEvalRun[]): FailureTaxonomy {
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
    else if ((FAILURE_CODES as readonly string[]).includes(code)) {
      taxonomy[code as (typeof FAILURE_CODES)[number]] += 1;
    } else taxonomy.none += 1;
  }
  return taxonomy;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function csvNumber(value: number | null): string {
  return value === null || Number.isNaN(value) ? "" : String(value);
}
