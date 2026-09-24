import { recallAtK } from "../metrics/metrics.js";

export interface ThresholdAttempt {
  taskId: string;
  confidence: number;
  scores: Record<string, number>;
  requiredTools: readonly string[];
  /** Present on runs but never used for branching (D4). */
  top1Probability?: number | null;
}

export interface ThresholdSelectOptions {
  grid?: readonly number[];
  highK?: number;
  mediumK?: number;
  /** Escalate branch candidate count for the mean-k tie-break (full toolspace when LLM unavailable). */
  escalateK?: number | "toolspace";
}

export type AdaptiveThresholdResult =
  | {
      status: "locked";
      thresholds: { T_low: number; T_high: number };
      development_n: number;
      holdout_n: number;
      objective: {
        dev_hit_rate: number;
        mean_candidate_count: number;
        holdout_hit_rate: number;
      };
      predictive: { high_conf_hit_rate: number; low_conf_hit_rate: number };
    }
  | {
      status: "negative";
      reason: string;
      development_n: number;
      holdout_n: number;
      predictive: { high_conf_hit_rate: number; low_conf_hit_rate: number };
    };

const DEFAULT_GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Even FNV-1a hash → development; odd → provisional holdout (adaptive-policy.md). */
export function isDevelopmentTask(taskId: string): boolean {
  return hashTaskId(taskId) % 2 === 0;
}

export function rankToolsByScore(scores: Record<string, number>): string[] {
  return Object.entries(scores)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name]) => name);
}

export function simulatePolicyHit(input: {
  scores: Record<string, number>;
  requiredTools: readonly string[];
  branch: "high" | "medium" | "low";
  highK: number;
  mediumK: number;
}): number {
  const ranked = rankToolsByScore(input.scores);
  if (input.branch === "low") {
    // Escalation unavailable offline → full toolspace (all ranked tools).
    const hit = recallAtK(input.requiredTools, ranked, ranked.length);
    return hit === null ? 0 : hit === 1 ? 1 : 0;
  }
  const k = input.branch === "high" ? input.highK : input.mediumK;
  const hit = recallAtK(input.requiredTools, ranked, k);
  return hit === null ? 0 : hit === 1 ? 1 : 0;
}

/**
 * Pre-registered grid search on the development split only.
 * Objective: maximize routing-hit rate under the adaptive k policy
 * (proxy from stored confidence + scores + required_tools; D4 ignores top1).
 */
export function selectAdaptiveThresholds(
  attempts: readonly ThresholdAttempt[],
  options: ThresholdSelectOptions = {},
): AdaptiveThresholdResult {
  const grid = options.grid ?? DEFAULT_GRID;
  const highK = options.highK ?? 1;
  const mediumK = options.mediumK ?? 5;
  const escalateK = options.escalateK ?? "toolspace";

  const development = attempts.filter((row) => isDevelopmentTask(row.taskId));
  const holdout = attempts.filter((row) => !isDevelopmentTask(row.taskId));
  const predictive = confidencePredictiveness(development, highK);

  if (development.length === 0) {
    return {
      status: "negative",
      reason: "no development attempts after taskId hash split",
      development_n: 0,
      holdout_n: holdout.length,
      predictive,
    };
  }

  if (!(predictive.high_conf_hit_rate > predictive.low_conf_hit_rate)) {
    return {
      status: "negative",
      reason:
        "development confidence is not predictive of routing hits (high-confidence third hit rate is not greater than low-confidence third)",
      development_n: development.length,
      holdout_n: holdout.length,
      predictive,
    };
  }

  let best: {
    T_low: number;
    T_high: number;
    hitRate: number;
    meanK: number;
  } | null = null;

  for (const T_low of grid) {
    for (const T_high of grid) {
      if (!(T_low < T_high)) continue;
      const scored = development.map((row) => {
        const branch = branchFor(row.confidence, T_low, T_high);
        const hit = simulatePolicyHit({
          scores: row.scores,
          requiredTools: row.requiredTools,
          branch,
          highK,
          mediumK,
        });
        const candidateCount = candidateCountFor(branch, row.scores, highK, mediumK, escalateK);
        return { hit, candidateCount };
      });
      const hitRate = scored.reduce((sum, row) => sum + row.hit, 0) / scored.length;
      const meanK = scored.reduce((sum, row) => sum + row.candidateCount, 0) / scored.length;
      if (
        best === null ||
        hitRate > best.hitRate ||
        (hitRate === best.hitRate && meanK < best.meanK) ||
        (hitRate === best.hitRate && meanK === best.meanK && T_low < best.T_low) ||
        (hitRate === best.hitRate &&
          meanK === best.meanK &&
          T_low === best.T_low &&
          T_high < best.T_high)
      ) {
        best = { T_low, T_high, hitRate, meanK };
      }
    }
  }

  if (best === null) {
    return {
      status: "negative",
      reason: "empty threshold grid",
      development_n: development.length,
      holdout_n: holdout.length,
      predictive,
    };
  }

  const holdoutHits = holdout.map((row) => {
    const branch = branchFor(row.confidence, best.T_low, best.T_high);
    return simulatePolicyHit({
      scores: row.scores,
      requiredTools: row.requiredTools,
      branch,
      highK,
      mediumK,
    });
  });
  const holdout_hit_rate =
    holdoutHits.length === 0 ? NaN : holdoutHits.reduce((sum, hit) => sum + hit, 0) / holdoutHits.length;

  return {
    status: "locked",
    thresholds: { T_low: best.T_low, T_high: best.T_high },
    development_n: development.length,
    holdout_n: holdout.length,
    objective: {
      dev_hit_rate: best.hitRate,
      mean_candidate_count: best.meanK,
      holdout_hit_rate,
    },
    predictive,
  };
}

function branchFor(confidence: number, T_low: number, T_high: number): "high" | "medium" | "low" {
  if (confidence >= T_high) return "high";
  if (confidence >= T_low) return "medium";
  return "low";
}

function candidateCountFor(
  branch: "high" | "medium" | "low",
  scores: Record<string, number>,
  highK: number,
  mediumK: number,
  escalateK: number | "toolspace",
): number {
  if (branch === "high") return highK;
  if (branch === "medium") return mediumK;
  if (escalateK === "toolspace") return Object.keys(scores).length;
  return escalateK;
}

function confidencePredictiveness(
  development: readonly ThresholdAttempt[],
  probeK: number,
): { high_conf_hit_rate: number; low_conf_hit_rate: number } {
  if (development.length === 0) {
    return { high_conf_hit_rate: 0, low_conf_hit_rate: 0 };
  }
  const sorted = [...development].sort((left, right) => left.confidence - right.confidence);
  const third = Math.max(1, Math.floor(sorted.length / 3));
  const low = sorted.slice(0, third);
  const high = sorted.slice(sorted.length - third);
  return {
    low_conf_hit_rate: meanHit(low, probeK),
    high_conf_hit_rate: meanHit(high, probeK),
  };
}

function meanHit(rows: readonly ThresholdAttempt[], k: number): number {
  if (rows.length === 0) return 0;
  let sum = 0;
  for (const row of rows) {
    const ranked = rankToolsByScore(row.scores);
    const hit = recallAtK(row.requiredTools, ranked, k);
    sum += hit === null ? 0 : hit === 1 ? 1 : 0;
  }
  return sum / rows.length;
}

function hashTaskId(taskId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < taskId.length; i++) {
    hash ^= taskId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
