import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ADAPTIVE_EVAL_HOLDOUT_SPLIT,
  ADAPTIVE_EVAL_POLICY_PATH,
  type AdaptiveEvalCellId,
} from "../config/adaptive-eval.js";
import {
  buildAdaptiveEvalTables,
  buildAdaptiveEvalTablesFromLoads,
  type AdaptiveEvalTableRow,
  type AdaptiveEvalTables,
  type AdaptiveEvalTablesOptions,
} from "./adaptive-eval-tables.js";
import type { ResultDirectoryLoad } from "./scaling-tables.js";

/**
 * Compact adaptive-vs-fixed comparison row (accuracy / cost / latency).
 * No winner field — report the comparison only (#45).
 */
export interface AdaptiveComparisonRow {
  cell_id: AdaptiveEvalCellId;
  architecture: string;
  top_k: number | null;
  attempts: number;
  execution_success_rate: number | null;
  recall_at_k: number | null;
  selection_accuracy: number | null;
  priced_cost_usd_per_attempt: number | null;
  router_input_tokens_per_attempt: number | null;
  agent_input_tokens_per_attempt: number | null;
  router_latency_ms_mean: number | null;
  agent_latency_ms_mean: number | null;
  escalation_frequency: number | null;
  mean_selected_k: number | null;
  /**
   * Delta vs the jev_top5 fixed-k control when both values exist.
   * Present for reading the tradeoff; never used to declare a winner.
   */
  delta_vs_jev_top5: {
    execution_success_rate: number | null;
    recall_at_k: number | null;
    priced_cost_usd_per_attempt: number | null;
    agent_input_tokens_per_attempt: number | null;
    mean_selected_k: number | null;
  } | null;
}

export interface AdaptiveBranchUsageRow {
  branch: "high" | "medium" | "low";
  count: number;
  frequency: number | null;
  /** Policy action described without claiming outcome quality. */
  action: string;
}

export interface AdaptiveSummaryTables {
  question: string;
  note: string;
  /** Null until a versioned superiority rule exists (none for M5). */
  decision_rule: null;
  policy_path: string;
  source_manifest: string | null;
  held_out_split: typeof ADAPTIVE_EVAL_HOLDOUT_SPLIT;
  comparison: AdaptiveComparisonRow[];
  branch_usage: AdaptiveBranchUsageRow[];
}

export const ADAPTIVE_SUMMARY_QUESTION =
  "How do adaptive confidence branches trade accuracy, cost, and latency against fixed-k Jev and baseline?";

export const ADAPTIVE_SUMMARY_NOTE =
  "These tables report the adaptive vs fixed-k comparison and branch usage only. They do not claim adaptive routing is superior.";

/** Build publication summary tables from a results root (recomputes via adaptive-eval aggregates). */
export function buildAdaptiveSummaryTables(
  resultsRoot: string,
  options: AdaptiveEvalTablesOptions = {},
): AdaptiveSummaryTables {
  return buildAdaptiveSummaryTablesFromEval(buildAdaptiveEvalTables(resultsRoot, options));
}

export function buildAdaptiveSummaryTablesFromLoads(
  directories: readonly ResultDirectoryLoad[],
): AdaptiveSummaryTables {
  return buildAdaptiveSummaryTablesFromEval(buildAdaptiveEvalTablesFromLoads(directories));
}

export function buildAdaptiveSummaryTablesFromEval(tables: AdaptiveEvalTables): AdaptiveSummaryTables {
  const jevTop5 = tables.rows.find((row) => row.cell_id === "jev_top5") ?? null;
  const comparison = tables.rows.map((row) => comparisonRow(row, jevTop5));

  const adaptive = tables.rows.find((row) => row.cell_id === "adaptive");
  const branch_usage = branchUsageRows(adaptive);

  return {
    question: ADAPTIVE_SUMMARY_QUESTION,
    note: ADAPTIVE_SUMMARY_NOTE,
    decision_rule: null,
    policy_path: tables.policy_path || ADAPTIVE_EVAL_POLICY_PATH,
    source_manifest: tables.source_manifest,
    held_out_split: {
      rule: tables.held_out_split.rule,
      complement_of: tables.held_out_split.complement_of,
      threshold_source_dir: tables.held_out_split.threshold_source_dir,
    },
    comparison,
    branch_usage,
  };
}

export function adaptiveSummaryTablesToJson(tables: AdaptiveSummaryTables): string {
  return `${JSON.stringify(tables, null, 2)}\n`;
}

export function adaptiveComparisonToCsv(tables: AdaptiveSummaryTables): string {
  const headers = [
    "cell_id",
    "architecture",
    "top_k",
    "attempts",
    "execution_success_rate",
    "recall_at_k",
    "selection_accuracy",
    "priced_cost_usd_per_attempt",
    "router_input_tokens_per_attempt",
    "agent_input_tokens_per_attempt",
    "router_latency_ms_mean",
    "agent_latency_ms_mean",
    "escalation_frequency",
    "mean_selected_k",
    "delta_esr_vs_jev_top5",
    "delta_recall_vs_jev_top5",
    "delta_cost_vs_jev_top5",
  ];
  const lines = [headers.join(",")];
  for (const row of tables.comparison) {
    lines.push(
      [
        row.cell_id,
        row.architecture,
        row.top_k ?? "",
        row.attempts,
        csvNumber(row.execution_success_rate),
        csvNumber(row.recall_at_k),
        csvNumber(row.selection_accuracy),
        csvNumber(row.priced_cost_usd_per_attempt),
        csvNumber(row.router_input_tokens_per_attempt),
        csvNumber(row.agent_input_tokens_per_attempt),
        csvNumber(row.router_latency_ms_mean),
        csvNumber(row.agent_latency_ms_mean),
        csvNumber(row.escalation_frequency),
        csvNumber(row.mean_selected_k),
        csvNumber(row.delta_vs_jev_top5?.execution_success_rate ?? null),
        csvNumber(row.delta_vs_jev_top5?.recall_at_k ?? null),
        csvNumber(row.delta_vs_jev_top5?.priced_cost_usd_per_attempt ?? null),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function adaptiveBranchUsageToCsv(tables: AdaptiveSummaryTables): string {
  const headers = ["branch", "count", "frequency", "action"];
  const lines = [headers.join(",")];
  for (const row of tables.branch_usage) {
    lines.push([row.branch, row.count, csvNumber(row.frequency), JSON.stringify(row.action)].join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function writeAdaptiveSummaryTables(
  tables: AdaptiveSummaryTables,
  outDir: string,
): { json: string; comparisonCsv: string; branchCsv: string } {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const json = join(dir, "adaptive-summary.json");
  const comparisonCsv = join(dir, "adaptive-comparison.csv");
  const branchCsv = join(dir, "adaptive-branch-usage.csv");
  writeFileSync(json, adaptiveSummaryTablesToJson(tables));
  writeFileSync(comparisonCsv, adaptiveComparisonToCsv(tables));
  writeFileSync(branchCsv, adaptiveBranchUsageToCsv(tables));
  return { json, comparisonCsv, branchCsv };
}

function comparisonRow(
  row: AdaptiveEvalTableRow,
  jevTop5: AdaptiveEvalTableRow | null,
): AdaptiveComparisonRow {
  const attempts = row.attempts;
  const perAttempt = (total: number): number | null => (attempts === 0 ? null : total / attempts);
  const base: AdaptiveComparisonRow = {
    cell_id: row.cell_id,
    architecture: row.architecture,
    top_k: row.top_k,
    attempts,
    execution_success_rate: row.execution_success_rate,
    recall_at_k: row.recall_at_k,
    selection_accuracy: row.selection_accuracy,
    priced_cost_usd_per_attempt: perAttempt(row.priced_cost_usd),
    router_input_tokens_per_attempt: perAttempt(row.router_input_tokens),
    agent_input_tokens_per_attempt: perAttempt(row.agent_input_tokens),
    router_latency_ms_mean: row.router_latency_ms.mean,
    agent_latency_ms_mean: row.agent_latency_ms.mean,
    escalation_frequency: row.escalation_frequency,
    mean_selected_k: row.mean_selected_k,
    delta_vs_jev_top5: null,
  };

  if (jevTop5 === null || row.cell_id === "jev_top5") return base;

  const controlCost = jevTop5.attempts === 0 ? null : jevTop5.priced_cost_usd / jevTop5.attempts;
  const controlAgentTok = jevTop5.attempts === 0 ? null : jevTop5.agent_input_tokens / jevTop5.attempts;

  return {
    ...base,
    delta_vs_jev_top5: {
      execution_success_rate: delta(base.execution_success_rate, jevTop5.execution_success_rate),
      recall_at_k: delta(base.recall_at_k, jevTop5.recall_at_k),
      priced_cost_usd_per_attempt: delta(base.priced_cost_usd_per_attempt, controlCost),
      agent_input_tokens_per_attempt: delta(base.agent_input_tokens_per_attempt, controlAgentTok),
      mean_selected_k: delta(base.mean_selected_k, jevTop5.mean_selected_k ?? jevTop5.top_k),
    },
  };
}

function branchUsageRows(adaptive: AdaptiveEvalTableRow | undefined): AdaptiveBranchUsageRow[] {
  const actions = {
    high: "jev_topk k=1",
    medium: "jev_topk k=5",
    low: "escalate llm_topk k=5",
  } as const;
  const counts = adaptive?.branch_counts ?? { high: 0, medium: 0, low: 0 };
  const total = counts.high + counts.medium + counts.low;
  return (["high", "medium", "low"] as const).map((branch) => ({
    branch,
    count: counts[branch],
    frequency: total === 0 ? null : counts[branch] / total,
    action: actions[branch],
  }));
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

function csvNumber(value: number | null): string {
  return value === null || Number.isNaN(value) ? "" : String(value);
}
