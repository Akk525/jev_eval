import {
  executionSuccessRate,
  summarizeLatency,
  summarizeSamples,
  type LatencySummary,
  type SampleSummary,
} from "./metrics.js";

/** Minimal run fields needed to recompute summary aggregates. */
export interface AggregateRun {
  /** Repetition index for this attempt. Defaults to 0 when omitted (legacy fixtures). */
  repetition?: number;
  routingExcluded: boolean;
  executionExcluded: boolean;
  executionSuccess: boolean;
  failureCode: string | null;
  recallAtK: number | null;
  confidence: number | null;
  routerUsage: { inputTokens: number; outputTokens: number };
  agentUsage: { inputTokens: number; outputTokens: number };
  pricedCostUsd: number;
  providerReportedCostUsd: number | null;
  routerLatencyMs: number | null;
  agentLatencyMs: number | null;
}

export interface CalibrationBucket {
  /** Inclusive low, exclusive high, except the last bucket which is inclusive high. */
  range: string;
  n: number;
  mean_confidence: number;
  empirical_hit_rate: number;
}

export interface CalibrationSummary {
  /** Routing-scored attempts with a non-null confidence. */
  scored: number;
  mean_confidence: number | null;
  /** Fraction of scored attempts with recallAtK === 1. */
  empirical_hit_rate: number | null;
  /** Expected Calibration Error over the fixed confidence buckets. Null when scored is 0. */
  ece: number | null;
  buckets: CalibrationBucket[];
}

/** Generic probability-vs-hit calibration (shared buckets / ECE with confidence path). */
export interface ProbabilityCalibrationBucket {
  range: string;
  n: number;
  mean_probability: number;
  empirical_hit_rate: number;
}

export interface ProbabilityCalibrationSummary {
  scored: number;
  mean_probability: number | null;
  empirical_hit_rate: number | null;
  ece: number | null;
  buckets: ProbabilityCalibrationBucket[];
}

export interface ProbabilitySample {
  probability: number;
  /** True when primary Recall@k === 1. */
  hit: boolean;
}

/**
 * Per-repetition quality rates, then mean / sample stddev / 95% CI across repetitions.
 * Null when fewer than two distinct repetition indexes appear in the raw runs.
 */
export interface RepetitionStats {
  repetitions: number;
  execution_success_rate: SampleSummary;
  recall_at_k: SampleSummary;
}

export interface AggregateSummary {
  attempts: number;
  r0_attempts: number;
  routing_scored: number;
  execution_scored: number;
  execution_success_rate: number | null;
  /**
   * Mean / sample stddev / 95% CI over execution-scored attempt outcomes (0/1).
   * R0 / execution-excluded attempts are omitted. Empty denominator → null mean.
   */
  execution_success_rate_stats: SampleSummary;
  /** Mean primary Recall@k over routing-scored attempts. Null when none. */
  recall_at_k: number | null;
  /**
   * Mean / sample stddev / 95% CI over primary Recall@k on routing-scored attempts.
   * R0 / routing-excluded attempts are omitted.
   */
  recall_at_k_stats: SampleSummary;
  /**
   * When raw runs cover 2+ repetition indexes, quality rates are computed per repetition
   * (still excluding R0 from each repetition's denominators), then summarized across reps.
   */
  by_repetition: RepetitionStats | null;
  router_input_tokens: number;
  router_output_tokens: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  priced_cost_usd: number;
  provider_reported_cost_usd: number | null;
  router_latency_ms: LatencySummary;
  agent_latency_ms: LatencySummary;
  calibration: CalibrationSummary;
}

const CONFIDENCE_BUCKETS: ReadonlyArray<{ label: string; low: number; high: number; last?: boolean }> = [
  { label: "0.00-0.50", low: 0, high: 0.5 },
  { label: "0.50-0.60", low: 0.5, high: 0.6 },
  { label: "0.60-0.70", low: 0.6, high: 0.7 },
  { label: "0.70-0.80", low: 0.7, high: 0.8 },
  { label: "0.80-0.90", low: 0.8, high: 0.9 },
  { label: "0.90-1.00", low: 0.9, high: 1.0, last: true },
];

/** Build summary.json fields from runs.jsonl lines. Pure and recomputable. */
export function aggregateRuns(runs: readonly AggregateRun[]): AggregateSummary {
  const routingScored = runs.filter((run) => !run.routingExcluded);
  const recalls = routingScored
    .map((run) => run.recallAtK)
    .filter((value): value is number => value !== null);
  const executionOutcomes = runs
    .filter((run) => !run.executionExcluded)
    .map((run) => (run.executionSuccess ? 1 : 0));
  const providerCosts = runs
    .map((run) => run.providerReportedCostUsd)
    .filter((value): value is number => value !== null);

  return {
    attempts: runs.length,
    r0_attempts: runs.filter((run) => run.failureCode === "R0").length,
    routing_scored: routingScored.length,
    execution_scored: runs.filter((run) => !run.executionExcluded).length,
    execution_success_rate: executionSuccessRate(runs),
    execution_success_rate_stats: summarizeSamples(executionOutcomes),
    recall_at_k: recalls.length === 0 ? null : mean(recalls),
    recall_at_k_stats: summarizeSamples(recalls),
    by_repetition: aggregateByRepetition(runs),
    router_input_tokens: sum(runs.map((run) => run.routerUsage.inputTokens)),
    router_output_tokens: sum(runs.map((run) => run.routerUsage.outputTokens)),
    agent_input_tokens: sum(runs.map((run) => run.agentUsage.inputTokens)),
    agent_output_tokens: sum(runs.map((run) => run.agentUsage.outputTokens)),
    priced_cost_usd: sum(runs.map((run) => run.pricedCostUsd)),
    provider_reported_cost_usd: providerCosts.length === 0 ? null : sum(providerCosts),
    router_latency_ms: summarizeLatency(
      runs.map((run) => run.routerLatencyMs).filter((value): value is number => value !== null),
    ),
    agent_latency_ms: summarizeLatency(
      runs.map((run) => run.agentLatencyMs).filter((value): value is number => value !== null),
    ),
    calibration: calibrateConfidence(routingScored),
  };
}

/**
 * One quality rate per repetition index, then sample stats across repetitions.
 * Returns null when only one repetition index is present.
 */
export function aggregateByRepetition(runs: readonly AggregateRun[]): RepetitionStats | null {
  const byRep = new Map<number, AggregateRun[]>();
  for (const run of runs) {
    const rep = run.repetition ?? 0;
    const bucket = byRep.get(rep);
    if (bucket === undefined) byRep.set(rep, [run]);
    else bucket.push(run);
  }
  if (byRep.size < 2) return null;

  const ordered = [...byRep.entries()].sort(([left], [right]) => left - right);
  const executionRates: number[] = [];
  const recallRates: number[] = [];

  for (const [, group] of ordered) {
    const esr = executionSuccessRate(group);
    if (esr !== null) executionRates.push(esr);
    const recalls = group
      .filter((run) => !run.routingExcluded)
      .map((run) => run.recallAtK)
      .filter((value): value is number => value !== null);
    if (recalls.length > 0) recallRates.push(mean(recalls));
  }

  return {
    repetitions: byRep.size,
    execution_success_rate: summarizeSamples(executionRates),
    recall_at_k: summarizeSamples(recallRates),
  };
}

/**
 * Bucketed calibration of a predicted probability against binary hits.
 * Uses the same fixed probability buckets and ECE definition as provider-confidence calibration.
 */
export function calibrateProbabilities(
  samples: readonly ProbabilitySample[],
): ProbabilityCalibrationSummary {
  if (samples.length === 0) {
    return {
      scored: 0,
      mean_probability: null,
      empirical_hit_rate: null,
      ece: null,
      buckets: [],
    };
  }

  const buckets: ProbabilityCalibrationBucket[] = [];
  let ece = 0;

  for (const bucket of CONFIDENCE_BUCKETS) {
    const inBucket = samples.filter((sample) => {
      if (bucket.last === true) {
        return sample.probability >= bucket.low && sample.probability <= bucket.high;
      }
      return sample.probability >= bucket.low && sample.probability < bucket.high;
    });
    if (inBucket.length === 0) continue;
    const meanProbability = mean(inBucket.map((sample) => sample.probability));
    const empiricalHitRate = mean(inBucket.map((sample) => (sample.hit ? 1 : 0)));
    buckets.push({
      range: bucket.label,
      n: inBucket.length,
      mean_probability: meanProbability,
      empirical_hit_rate: empiricalHitRate,
    });
    ece += (inBucket.length / samples.length) * Math.abs(meanProbability - empiricalHitRate);
  }

  return {
    scored: samples.length,
    mean_probability: mean(samples.map((sample) => sample.probability)),
    empirical_hit_rate: mean(samples.map((sample) => (sample.hit ? 1 : 0))),
    ece,
    buckets,
  };
}

/**
 * Compare provider confidence to empirical routing hits (recallAtK === 1).
 * Attempts without confidence stay out of the calibration denominator.
 * Top-1 probability is never substituted for confidence (D4).
 */
export function calibrateConfidence(runs: readonly AggregateRun[]): CalibrationSummary {
  const samples: ProbabilitySample[] = runs
    .filter((run) => !run.routingExcluded && run.confidence !== null && run.recallAtK !== null)
    .map((run) => ({
      probability: run.confidence as number,
      hit: run.recallAtK === 1,
    }));
  const calibrated = calibrateProbabilities(samples);
  return {
    scored: calibrated.scored,
    mean_confidence: calibrated.mean_probability,
    empirical_hit_rate: calibrated.empirical_hit_rate,
    ece: calibrated.ece,
    buckets: calibrated.buckets.map((bucket) => ({
      range: bucket.range,
      n: bucket.n,
      mean_confidence: bucket.mean_probability,
      empirical_hit_rate: bucket.empirical_hit_rate,
    })),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
