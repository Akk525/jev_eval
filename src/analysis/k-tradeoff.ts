import {
  buildKSweepTablesFromManifest,
  buildKSweepTablesFromLoads,
  type KSweepTableRow,
  type KSweepTables,
} from "./k-sweep-tables.js";
import { refuseResultsRootScan } from "./manifest-scope.js";
import type { ResultDirectoryLoad } from "./scaling-tables.js";

/**
 * Compact M4 tradeoff row: k vs recall vs context/tokens vs ESR vs cost vs latency.
 * No optimal-k field — report the curve only (issue #41).
 */
export interface KTradeoffRow {
  top_k: number;
  toolspace_size: number;
  /** Strict primary Recall@k. */
  recall_at_k: number | null;
  /** Mean |candidates| presented to the agent after routing. */
  mean_candidate_count: number | null;
  /** Mean agent input tokens per attempt (context-load proxy). */
  agent_input_tokens_per_attempt: number | null;
  /** Mean router input tokens per attempt. */
  router_input_tokens_per_attempt: number | null;
  execution_success_rate: number | null;
  selection_accuracy: number | null;
  /** Mean priced USD per attempt. */
  priced_cost_usd_per_attempt: number | null;
  router_latency_ms_mean: number | null;
  agent_latency_ms_mean: number | null;
  /**
   * Change vs the previous (smaller) k in the table, when both values exist.
   * Present for reading the tradeoff; never used to declare a winner.
   */
  delta_vs_previous_k: {
    recall_at_k: number | null;
    mean_candidate_count: number | null;
    agent_input_tokens_per_attempt: number | null;
    execution_success_rate: number | null;
    priced_cost_usd_per_attempt: number | null;
  } | null;
}

export interface KTradeoffTable {
  /** Fixed research framing for this artifact. */
  question: string;
  /**
   * Explicit non-claim. Do not add an optimal_k field unless a versioned decision
   * rule is documented first and kept out of the evaluation labeling loop.
   */
  note: string;
  /** Null until a versioned decision rule exists. */
  decision_rule: null;
  toolspace_size: number | null;
  rows: KTradeoffRow[];
}

export const K_TRADEOFF_QUESTION =
  "How much candidate context is required before more routing recall stops helping downstream success?";

export const K_TRADEOFF_NOTE =
  "This table reports the k tradeoff only. It does not select a winning k.";

/** @deprecated Prefer buildKTradeoffTableFromManifest. */
export function buildKTradeoffTable(_resultsRoot: string): KTradeoffTable {
  refuseResultsRootScan("buildKTradeoffTable");
}

export function buildKTradeoffTableFromManifest(manifestPath: string): KTradeoffTable {
  return buildKTradeoffTableFromKSweep(buildKSweepTablesFromManifest(manifestPath));
}

export function buildKTradeoffTableFromLoads(directories: readonly ResultDirectoryLoad[]): KTradeoffTable {
  return buildKTradeoffTableFromKSweep(buildKSweepTablesFromLoads(directories));
}

export function buildKTradeoffTableFromKSweep(tables: KSweepTables): KTradeoffTable {
  const rows: KTradeoffRow[] = [];
  let previous: KTradeoffRow | null = null;

  for (const source of tables.rows) {
    const row = tradeoffRowFromKSweep(source);
    row.delta_vs_previous_k =
      previous === null
        ? null
        : {
            recall_at_k: delta(row.recall_at_k, previous.recall_at_k),
            mean_candidate_count: delta(row.mean_candidate_count, previous.mean_candidate_count),
            agent_input_tokens_per_attempt: delta(
              row.agent_input_tokens_per_attempt,
              previous.agent_input_tokens_per_attempt,
            ),
            execution_success_rate: delta(row.execution_success_rate, previous.execution_success_rate),
            priced_cost_usd_per_attempt: delta(
              row.priced_cost_usd_per_attempt,
              previous.priced_cost_usd_per_attempt,
            ),
          };
    rows.push(row);
    previous = row;
  }

  return {
    question: K_TRADEOFF_QUESTION,
    note: K_TRADEOFF_NOTE,
    decision_rule: null,
    toolspace_size: rows[0]?.toolspace_size ?? null,
    rows,
  };
}

export function kTradeoffTableToJson(table: KTradeoffTable): string {
  return `${JSON.stringify(table, null, 2)}\n`;
}

export function kTradeoffTableToCsv(table: KTradeoffTable): string {
  const headers = [
    "top_k",
    "toolspace_size",
    "recall_at_k",
    "mean_candidate_count",
    "agent_input_tokens_per_attempt",
    "router_input_tokens_per_attempt",
    "execution_success_rate",
    "selection_accuracy",
    "priced_cost_usd_per_attempt",
    "router_latency_ms_mean",
    "agent_latency_ms_mean",
    "delta_recall_at_k",
    "delta_mean_candidate_count",
    "delta_agent_input_tokens_per_attempt",
    "delta_execution_success_rate",
    "delta_priced_cost_usd_per_attempt",
  ];
  const lines = [
    `# ${table.note}`,
    `# decision_rule=${table.decision_rule === null ? "null" : table.decision_rule}`,
    headers.join(","),
  ];
  for (const row of table.rows) {
    const d = row.delta_vs_previous_k;
    lines.push(
      [
        row.top_k,
        row.toolspace_size,
        csvNumber(row.recall_at_k),
        csvNumber(row.mean_candidate_count),
        csvNumber(row.agent_input_tokens_per_attempt),
        csvNumber(row.router_input_tokens_per_attempt),
        csvNumber(row.execution_success_rate),
        csvNumber(row.selection_accuracy),
        csvNumber(row.priced_cost_usd_per_attempt),
        csvNumber(row.router_latency_ms_mean),
        csvNumber(row.agent_latency_ms_mean),
        csvNumber(d?.recall_at_k ?? null),
        csvNumber(d?.mean_candidate_count ?? null),
        csvNumber(d?.agent_input_tokens_per_attempt ?? null),
        csvNumber(d?.execution_success_rate ?? null),
        csvNumber(d?.priced_cost_usd_per_attempt ?? null),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function tradeoffRowFromKSweep(source: KSweepTableRow): KTradeoffRow {
  const attempts = source.attempts;
  return {
    top_k: source.top_k,
    toolspace_size: source.toolspace_size,
    recall_at_k: source.recall_at_k,
    mean_candidate_count: source.mean_candidate_count,
    agent_input_tokens_per_attempt: perAttempt(source.agent_input_tokens, attempts),
    router_input_tokens_per_attempt: perAttempt(source.router_input_tokens, attempts),
    execution_success_rate: source.execution_success_rate,
    selection_accuracy: source.selection_accuracy,
    priced_cost_usd_per_attempt: perAttempt(source.priced_cost_usd, attempts),
    router_latency_ms_mean: source.router_latency_ms.mean,
    agent_latency_ms_mean: source.agent_latency_ms.mean,
    delta_vs_previous_k: null,
  };
}

function perAttempt(total: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return total / attempts;
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
