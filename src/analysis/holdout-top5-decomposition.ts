import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export class HoldoutDecompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HoldoutDecompositionError";
  }
}

export interface DecompositionRun {
  taskId: string;
  confidence: number | null;
  scores: Record<string, number> | null;
  recallAtK: number | null;
  selectionAccuracy: number | null;
  executionExcluded: boolean;
  routingExcluded: boolean;
  executionSuccess: boolean | null;
  failureCode: string | null;
  candidates: readonly string[] | null;
}

export interface DistributionSummary {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
  values: number[];
}

export interface ScoreShapeSummary {
  margin: number;
  entropy: number;
  n_positive: number;
}

export interface HoldoutTop5Decomposition {
  version: 1;
  note: string;
  source: {
    top1_directory: string;
    top5_directory: string;
    task_count: number;
  };
  recall: {
    n: number;
    recall_at_1: number;
    recall_at_5: number;
    hits_at_1: number;
    hits_at_5: number;
  };
  contingency: {
    top1_hit_top5_hit: number;
    top1_miss_top5_hit: number;
    top1_miss_top5_miss: number;
    top1_hit_top5_miss: number;
  };
  recovery: {
    /** Gold absent from top-1 candidates but present in top-5. */
    recoverable_routing_misses: number;
    /** Recoverable tasks with a scored agent execution. */
    execution_scored: number;
    /** Recoverable + execution scored + executionSuccess. */
    execution_recovered: number;
    execution_recovery_rate: number | null;
    /** Recoverable with defined selectionAccuracy. */
    selection_scored: number;
    selection_hits: number;
    selection_accuracy: number | null;
    tasks: Array<{
      task_id: string;
      top1_confidence: number | null;
      top1_failure_code: string | null;
      top5_failure_code: string | null;
      top5_execution_success: boolean | null;
      top5_selection_accuracy: number | null;
    }>;
  };
  top5_failures: {
    execution_scored: number;
    failures: number;
    by_code: Record<string, number>;
    r1_routing: Array<{ task_id: string; confidence: number | null }>;
    r2_selection: Array<{ task_id: string; confidence: number | null; gold_in_top5: boolean }>;
    other: Array<{ task_id: string; failure_code: string | null; confidence: number | null }>;
  };
  confidence_by_top1_routing: {
    correct: DistributionSummary;
    incorrect: DistributionSummary;
  };
  /** Exploratory — not used by adaptive v1 (D4 keeps confidence ≠ top-1). */
  score_shape_by_top1_routing: {
    margin_correct: DistributionSummary;
    margin_incorrect: DistributionSummary;
    entropy_correct: DistributionSummary;
    entropy_incorrect: DistributionSummary;
  };
}

const NOTE =
  "Holdout decomposition of fixed Jev top-1 vs top-5 on the same task set. " +
  "Does not retune adaptive thresholds. Confidence comparison is routing correctness " +
  "(recallAtK === 1 on the top-1 cell), not execution success.";

/**
 * Decompose why top-5 differs from top-1 on a paired holdout:
 * Recall@1 vs @5, recovery when gold enters the set at k=5, top-5 R1 vs R2,
 * and confidence / score-shape distributions for top-1 routing hits vs misses.
 */
export function buildHoldoutTop5Decomposition(
  top1Directory: string,
  top5Directory: string,
): HoldoutTop5Decomposition {
  const top1 = loadRuns(resolve(top1Directory));
  const top5 = loadRuns(resolve(top5Directory));
  const top1ById = indexByTask(top1);
  const top5ById = indexByTask(top5);
  const taskIds = [...top1ById.keys()].sort();
  for (const id of taskIds) {
    if (!top5ById.has(id)) {
      throw new HoldoutDecompositionError(`task ${id} present in top-1 dir but missing from top-5`);
    }
  }
  for (const id of top5ById.keys()) {
    if (!top1ById.has(id)) {
      throw new HoldoutDecompositionError(`task ${id} present in top-5 dir but missing from top-1`);
    }
  }

  const rows = taskIds.map((id) => {
    const a = top1ById.get(id)!;
    const b = top5ById.get(id)!;
    return {
      id,
      top1: a,
      top5: b,
      goldInTop1: a.recallAtK === 1,
      goldInTop5: b.recallAtK === 1,
    };
  });

  const routingTop1 = rows.filter((r) => !r.top1.routingExcluded);
  const routingTop5 = rows.filter((r) => !r.top5.routingExcluded);
  const hits1 = routingTop1.filter((r) => r.goldInTop1).length;
  const hits5 = routingTop5.filter((r) => r.goldInTop5).length;

  const recoverable = rows.filter((r) => !r.goldInTop1 && r.goldInTop5);
  const recoverExec = recoverable.filter((r) => !r.top5.executionExcluded);
  const recoverOk = recoverExec.filter((r) => r.top5.executionSuccess === true);
  const recoverSel = recoverable.filter((r) => r.top5.selectionAccuracy !== null);
  const recoverSelHit = recoverSel.filter((r) => r.top5.selectionAccuracy === 1);

  const top5Exec = rows.filter((r) => !r.top5.executionExcluded);
  const top5Fails = top5Exec.filter((r) => r.top5.executionSuccess !== true);
  const byCode: Record<string, number> = {};
  for (const r of top5Fails) {
    const code = r.top5.failureCode ?? "null";
    byCode[code] = (byCode[code] ?? 0) + 1;
  }

  const correctConf = rows
    .filter((r) => r.goldInTop1 && typeof r.top1.confidence === "number")
    .map((r) => r.top1.confidence as number);
  const incorrectConf = rows
    .filter((r) => !r.goldInTop1 && typeof r.top1.confidence === "number")
    .map((r) => r.top1.confidence as number);

  const shapes = rows.map((r) => ({
    hit: r.goldInTop1,
    shape: scoreShape(r.top1.scores),
  }));
  const marginCorrect = shapes.filter((s) => s.hit && s.shape).map((s) => s.shape!.margin);
  const marginIncorrect = shapes.filter((s) => !s.hit && s.shape).map((s) => s.shape!.margin);
  const entropyCorrect = shapes.filter((s) => s.hit && s.shape).map((s) => s.shape!.entropy);
  const entropyIncorrect = shapes.filter((s) => !s.hit && s.shape).map((s) => s.shape!.entropy);

  return {
    version: 1,
    note: NOTE,
    source: {
      top1_directory: resolve(top1Directory),
      top5_directory: resolve(top5Directory),
      task_count: taskIds.length,
    },
    recall: {
      n: routingTop1.length,
      recall_at_1: rate(hits1, routingTop1.length),
      recall_at_5: rate(hits5, routingTop5.length),
      hits_at_1: hits1,
      hits_at_5: hits5,
    },
    contingency: {
      top1_hit_top5_hit: rows.filter((r) => r.goldInTop1 && r.goldInTop5).length,
      top1_miss_top5_hit: recoverable.length,
      top1_miss_top5_miss: rows.filter((r) => !r.goldInTop1 && !r.goldInTop5).length,
      top1_hit_top5_miss: rows.filter((r) => r.goldInTop1 && !r.goldInTop5).length,
    },
    recovery: {
      recoverable_routing_misses: recoverable.length,
      execution_scored: recoverExec.length,
      execution_recovered: recoverOk.length,
      execution_recovery_rate: recoverExec.length === 0 ? null : rate(recoverOk.length, recoverExec.length),
      selection_scored: recoverSel.length,
      selection_hits: recoverSelHit.length,
      selection_accuracy: recoverSel.length === 0 ? null : rate(recoverSelHit.length, recoverSel.length),
      tasks: recoverable.map((r) => ({
        task_id: r.id,
        top1_confidence: r.top1.confidence,
        top1_failure_code: r.top1.failureCode,
        top5_failure_code: r.top5.failureCode,
        top5_execution_success: r.top5.executionSuccess,
        top5_selection_accuracy: r.top5.selectionAccuracy,
      })),
    },
    top5_failures: {
      execution_scored: top5Exec.length,
      failures: top5Fails.length,
      by_code: byCode,
      r1_routing: top5Fails
        .filter((r) => r.top5.failureCode === "R1")
        .map((r) => ({ task_id: r.id, confidence: r.top1.confidence })),
      r2_selection: top5Fails
        .filter((r) => r.top5.failureCode === "R2")
        .map((r) => ({
          task_id: r.id,
          confidence: r.top1.confidence,
          gold_in_top5: r.goldInTop5,
        })),
      other: top5Fails
        .filter((r) => r.top5.failureCode !== "R1" && r.top5.failureCode !== "R2")
        .map((r) => ({
          task_id: r.id,
          failure_code: r.top5.failureCode,
          confidence: r.top1.confidence,
        })),
    },
    confidence_by_top1_routing: {
      correct: distribution(correctConf),
      incorrect: distribution(incorrectConf),
    },
    score_shape_by_top1_routing: {
      margin_correct: distribution(marginCorrect),
      margin_incorrect: distribution(marginIncorrect),
      entropy_correct: distribution(entropyCorrect),
      entropy_incorrect: distribution(entropyIncorrect),
    },
  };
}

export function writeHoldoutTop5Decomposition(
  data: HoldoutTop5Decomposition,
  outDir: string,
): { json: string } {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const json = join(dir, "holdout-top5-decomposition.json");
  writeFileSync(json, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { json };
}

export function loadRuns(directory: string): DecompositionRun[] {
  const runsPath = join(directory, "runs.jsonl");
  if (!existsSync(runsPath)) {
    throw new HoldoutDecompositionError(`missing runs.jsonl in ${directory}`);
  }
  return readFileSync(runsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const taskId = raw.taskId;
      if (typeof taskId !== "string") {
        throw new HoldoutDecompositionError(`runs.jsonl line missing taskId in ${directory}`);
      }
      return {
        taskId,
        confidence: typeof raw.confidence === "number" ? raw.confidence : null,
        scores:
          raw.scores && typeof raw.scores === "object" && !Array.isArray(raw.scores)
            ? (raw.scores as Record<string, number>)
            : null,
        recallAtK: typeof raw.recallAtK === "number" ? raw.recallAtK : null,
        selectionAccuracy: typeof raw.selectionAccuracy === "number" ? raw.selectionAccuracy : null,
        executionExcluded: Boolean(raw.executionExcluded),
        routingExcluded: Boolean(raw.routingExcluded),
        executionSuccess:
          typeof raw.executionSuccess === "boolean" ? raw.executionSuccess : null,
        failureCode: typeof raw.failureCode === "string" ? raw.failureCode : null,
        candidates: Array.isArray(raw.candidates) ? (raw.candidates as string[]) : null,
      };
    });
}

function indexByTask(runs: readonly DecompositionRun[]): Map<string, DecompositionRun> {
  const map = new Map<string, DecompositionRun>();
  for (const run of runs) {
    if (map.has(run.taskId)) {
      throw new HoldoutDecompositionError(`duplicate taskId ${run.taskId}`);
    }
    map.set(run.taskId, run);
  }
  return map;
}

function rate(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function distribution(values: readonly number[]): DistributionSummary {
  if (values.length === 0) {
    return { n: 0, min: NaN, p25: NaN, median: NaN, p75: NaN, max: NaN, mean: NaN, values: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    n: values.length,
    min: sorted[0]!,
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: sorted[sorted.length - 1]!,
    mean,
    values: sorted,
  };
}

export function scoreShape(scores: Record<string, number> | null): ScoreShapeSummary | null {
  if (!scores) return null;
  const vals = Object.values(scores)
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => b - a);
  if (vals.length === 0) return null;
  const top1 = vals[0]!;
  const top2 = vals[1] ?? 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return { margin: top1 - top2, entropy: 0, n_positive: 0 };
  }
  const ps = vals.map((v) => v / sum).filter((p) => p > 0);
  const entropy = -ps.reduce((a, p) => a + p * Math.log2(p), 0);
  return {
    margin: top1 - top2,
    entropy,
    n_positive: vals.filter((v) => v > 0).length,
  };
}
