import { resolve } from "node:path";
import {
  K_SWEEP_TOOLSPACE_SIZE,
  type KSweepTopK,
} from "../config/k-sweep.js";
import { loadCompletedCellsFromManifest, refuseResultsRootScan } from "./manifest-scope.js";
import {
  type ResultDirectoryLoad,
  type ScalingRun,
} from "./scaling-tables.js";

/** Adjacent k transitions for the frozen M4 ablation. */
export const MARGINAL_K_TRANSITIONS = [
  [1, 3],
  [3, 5],
  [5, 10],
] as const satisfies ReadonlyArray<readonly [KSweepTopK, KSweepTopK]>;

export type MarginalKTransition = (typeof MARGINAL_K_TRANSITIONS)[number];

export class MarginalRoutingUtilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarginalRoutingUtilityError";
  }
}

export interface PairedTaskRun {
  taskId: string;
  recallAtK: number | null;
  routingExcluded: boolean;
  executionExcluded: boolean;
  executionSuccess: boolean;
  failureCode: string | null;
  selectionAccuracy: number | null;
  agentInputTokens: number;
  agentOutputTokens: number;
  pricedCostUsd: number;
  totalLatencyMs: number | null;
}

export interface MarginalTransitionRow {
  from_k: number;
  to_k: number;
  paired_tasks: number;
  /**
   * Tasks where strict Recall@k flips from miss (≠1) at from_k to hit (===1) at to_k.
   * Proxy for “required tool newly enters the candidate set.”
   */
  additional_routing_coverage: number;
  /**
   * Among additional_routing_coverage tasks, how many succeed at to_k
   * (executionSuccess && !executionExcluded).
   */
  additional_coverage_that_succeed: number;
  /** Tasks that were successes at from_k and failures at to_k. */
  previously_successful_become_failures: number;
  /** Count(R1 at from_k) − count(R1 at to_k) over paired tasks. */
  r1_reduction: number;
  /** Count(R2 at to_k) − count(R2 at from_k). */
  r2_change: number;
  /** Mean selection accuracy (scored) at to_k − from_k. */
  selection_accuracy_change: number | null;
  /** Mean agent tokens (in+out) per attempt at to_k − from_k. */
  agent_tokens_change: number;
  /** Mean priced USD per attempt at to_k − from_k. */
  cost_change: number;
  /** Mean totalLatencyMs (non-null) at to_k − from_k. */
  total_latency_change: number | null;
  /** Task ids with additional routing coverage (stable sort). */
  additional_coverage_task_ids: string[];
  /** Task ids newly covered that succeed at to_k. */
  additional_coverage_success_task_ids: string[];
  /** Task ids that flip success→failure. */
  regression_task_ids: string[];
}

export interface MarginalRoutingUtilityReport {
  version: 1;
  kind: "m4_marginal_routing_utility";
  note: string;
  toolspace_size: number;
  transitions: MarginalTransitionRow[];
  /**
   * Explicit non-claim. Optimal k is not selected from this curve unless a
   * decision rule was versioned before the run.
   */
  decision_rule: null;
}

export const MARGINAL_ROUTING_UTILITY_NOTE =
  "Paired adjacent-k transitions at fixed N. Distinguishes additional routing " +
  "coverage from coverage that produces downstream execution utility. " +
  "Does not select an optimal k.";

/**
 * @deprecated Prefer buildMarginalRoutingUtilityFromManifest.
 */
export function buildMarginalRoutingUtility(_resultsRoot: string): MarginalRoutingUtilityReport {
  refuseResultsRootScan("buildMarginalRoutingUtility");
}

export function buildMarginalRoutingUtilityFromManifest(
  manifestPath: string,
): MarginalRoutingUtilityReport {
  const scoped = loadCompletedCellsFromManifest(manifestPath);
  return buildMarginalRoutingUtilityFromLoads(scoped.directories.filter(isKSweepDirectory));
}

export function buildMarginalRoutingUtilityFromLoads(
  directories: readonly ResultDirectoryLoad[],
): MarginalRoutingUtilityReport {
  const byK = indexByTopK(directories);
  const transitions: MarginalTransitionRow[] = [];

  for (const [fromK, toK] of MARGINAL_K_TRANSITIONS) {
    const fromLoads = byK.get(fromK);
    const toLoads = byK.get(toK);
    if (fromLoads === undefined || toLoads === undefined) {
      throw new MarginalRoutingUtilityError(
        `missing k-sweep dirs for transition k=${fromK}→${toK} (need both cells)`,
      );
    }
    transitions.push(transitionRow(fromK, toK, flattenRuns(fromLoads), flattenRuns(toLoads)));
  }

  return {
    version: 1,
    kind: "m4_marginal_routing_utility",
    note: MARGINAL_ROUTING_UTILITY_NOTE,
    toolspace_size: K_SWEEP_TOOLSPACE_SIZE,
    transitions,
    decision_rule: null,
  };
}

export function marginalRoutingUtilityToJson(report: MarginalRoutingUtilityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function marginalRoutingUtilityToCsv(report: MarginalRoutingUtilityReport): string {
  const headers = [
    "from_k",
    "to_k",
    "paired_tasks",
    "additional_routing_coverage",
    "additional_coverage_that_succeed",
    "previously_successful_become_failures",
    "r1_reduction",
    "r2_change",
    "selection_accuracy_change",
    "agent_tokens_change",
    "cost_change",
    "total_latency_change",
  ];
  const lines = [`# ${report.note}`, `# decision_rule=null`, headers.join(",")];
  for (const row of report.transitions) {
    lines.push(
      [
        row.from_k,
        row.to_k,
        row.paired_tasks,
        row.additional_routing_coverage,
        row.additional_coverage_that_succeed,
        row.previously_successful_become_failures,
        row.r1_reduction,
        row.r2_change,
        csvNumber(row.selection_accuracy_change),
        csvNumber(row.agent_tokens_change),
        csvNumber(row.cost_change),
        csvNumber(row.total_latency_change),
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

function indexByTopK(directories: readonly ResultDirectoryLoad[]): Map<number, ResultDirectoryLoad[]> {
  const map = new Map<number, ResultDirectoryLoad[]>();
  for (const loaded of directories) {
    const topK = loaded.config.topK as number;
    const bucket = map.get(topK);
    if (bucket === undefined) map.set(topK, [loaded]);
    else bucket.push(loaded);
  }
  return map;
}

function flattenRuns(loads: readonly ResultDirectoryLoad[]): Map<string, PairedTaskRun> {
  const byTask = new Map<string, PairedTaskRun>();
  for (const load of loads) {
    for (const run of load.runs) {
      const taskId = run.taskId;
      if (taskId === undefined || taskId === "") {
        throw new MarginalRoutingUtilityError(
          `run missing taskId in ${resolve(load.directory)} (marginal utility requires paired task ids)`,
        );
      }
      if (byTask.has(taskId)) {
        throw new MarginalRoutingUtilityError(
          `duplicate taskId ${taskId} across k=${load.config.topK} dirs; refuse to mix epochs`,
        );
      }
      byTask.set(taskId, toPaired(run, taskId));
    }
  }
  return byTask;
}

function toPaired(run: ScalingRun, taskId: string): PairedTaskRun {
  return {
    taskId,
    recallAtK: run.recallAtK,
    routingExcluded: run.routingExcluded,
    executionExcluded: run.executionExcluded,
    executionSuccess: run.executionSuccess,
    failureCode: run.failureCode,
    selectionAccuracy: run.selectionAccuracy,
    agentInputTokens: run.agentUsage.inputTokens,
    agentOutputTokens: run.agentUsage.outputTokens,
    pricedCostUsd: run.pricedCostUsd,
    totalLatencyMs: run.totalLatencyMs ?? null,
  };
}

function transitionRow(
  fromK: number,
  toK: number,
  fromByTask: Map<string, PairedTaskRun>,
  toByTask: Map<string, PairedTaskRun>,
): MarginalTransitionRow {
  const taskIds = [...fromByTask.keys()].sort();
  for (const id of taskIds) {
    if (!toByTask.has(id)) {
      throw new MarginalRoutingUtilityError(`task ${id} present at k=${fromK} but missing at k=${toK}`);
    }
  }
  for (const id of toByTask.keys()) {
    if (!fromByTask.has(id)) {
      throw new MarginalRoutingUtilityError(`task ${id} present at k=${toK} but missing at k=${fromK}`);
    }
  }

  const pairs = taskIds.map((id) => ({
    id,
    from: fromByTask.get(id)!,
    to: toByTask.get(id)!,
  }));

  const additionalCoverage = pairs.filter(
    (p) =>
      !p.from.routingExcluded &&
      !p.to.routingExcluded &&
      p.from.recallAtK !== 1 &&
      p.to.recallAtK === 1,
  );
  const additionalSuccess = additionalCoverage.filter(
    (p) => !p.to.executionExcluded && p.to.executionSuccess,
  );
  const regressions = pairs.filter(
    (p) =>
      !p.from.executionExcluded &&
      p.from.executionSuccess &&
      (p.to.executionExcluded || !p.to.executionSuccess),
  );

  const r1From = pairs.filter((p) => p.from.failureCode === "R1").length;
  const r1To = pairs.filter((p) => p.to.failureCode === "R1").length;
  const r2From = pairs.filter((p) => p.from.failureCode === "R2").length;
  const r2To = pairs.filter((p) => p.to.failureCode === "R2").length;

  const selFrom = mean(
    pairs.map((p) => p.from.selectionAccuracy).filter((v): v is number => v !== null),
  );
  const selTo = mean(
    pairs.map((p) => p.to.selectionAccuracy).filter((v): v is number => v !== null),
  );

  const agentFrom = mean(pairs.map((p) => p.from.agentInputTokens + p.from.agentOutputTokens));
  const agentTo = mean(pairs.map((p) => p.to.agentInputTokens + p.to.agentOutputTokens));
  const costFrom = mean(pairs.map((p) => p.from.pricedCostUsd));
  const costTo = mean(pairs.map((p) => p.to.pricedCostUsd));

  const latFromValues = pairs
    .map((p) => p.from.totalLatencyMs)
    .filter((v): v is number => v !== null);
  const latToValues = pairs.map((p) => p.to.totalLatencyMs).filter((v): v is number => v !== null);
  const latFrom = latFromValues.length === 0 ? null : mean(latFromValues);
  const latTo = latToValues.length === 0 ? null : mean(latToValues);

  return {
    from_k: fromK,
    to_k: toK,
    paired_tasks: pairs.length,
    additional_routing_coverage: additionalCoverage.length,
    additional_coverage_that_succeed: additionalSuccess.length,
    previously_successful_become_failures: regressions.length,
    r1_reduction: r1From - r1To,
    r2_change: r2To - r2From,
    selection_accuracy_change:
      selFrom === null || selTo === null ? null : selTo - selFrom,
    agent_tokens_change: agentTo! - agentFrom!,
    cost_change: costTo! - costFrom!,
    total_latency_change: latFrom === null || latTo === null ? null : latTo - latFrom,
    additional_coverage_task_ids: additionalCoverage.map((p) => p.id),
    additional_coverage_success_task_ids: additionalSuccess.map((p) => p.id),
    regression_task_ids: regressions.map((p) => p.id),
  };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

export type { KSweepTopK };
