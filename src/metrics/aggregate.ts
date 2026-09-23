import {
  executionSuccessRate,
  summarizeLatency,
  type LatencySummary,
} from "./metrics.js";

/** Minimal run fields needed to recompute summary aggregates. */
export interface AggregateRun {
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

export interface AggregateSummary {
  attempts: number;
  r0_attempts: number;
  routing_scored: number;
  execution_scored: number;
  execution_success_rate: number | null;
  /** Mean primary Recall@k over routing-scored attempts. Null when none. */
  recall_at_k: number | null;
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
  const providerCosts = runs
    .map((run) => run.providerReportedCostUsd)
    .filter((value): value is number => value !== null);

  return {
    attempts: runs.length,
    r0_attempts: runs.filter((run) => run.failureCode === "R0").length,
    routing_scored: routingScored.length,
    execution_scored: runs.filter((run) => !run.executionExcluded).length,
    execution_success_rate: executionSuccessRate(runs),
    recall_at_k: recalls.length === 0 ? null : mean(recalls),
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
 * Compare provider confidence to empirical routing hits (recallAtK === 1).
 * Attempts without confidence stay out of the calibration denominator.
 */
export function calibrateConfidence(runs: readonly AggregateRun[]): CalibrationSummary {
  const scored = runs.filter(
    (run) => !run.routingExcluded && run.confidence !== null && run.recallAtK !== null,
  );
  if (scored.length === 0) {
    return {
      scored: 0,
      mean_confidence: null,
      empirical_hit_rate: null,
      ece: null,
      buckets: [],
    };
  }

  const hits = scored.map((run) => (run.recallAtK === 1 ? 1 : 0));
  const confidences = scored.map((run) => run.confidence as number);
  const buckets: CalibrationBucket[] = [];
  let ece = 0;

  for (const bucket of CONFIDENCE_BUCKETS) {
    const inBucket = scored.filter((run) => {
      const confidence = run.confidence as number;
      if (bucket.last === true) return confidence >= bucket.low && confidence <= bucket.high;
      return confidence >= bucket.low && confidence < bucket.high;
    });
    if (inBucket.length === 0) continue;
    const meanConfidence = mean(inBucket.map((run) => run.confidence as number));
    const empiricalHitRate = mean(inBucket.map((run) => (run.recallAtK === 1 ? 1 : 0)));
    buckets.push({
      range: bucket.label,
      n: inBucket.length,
      mean_confidence: meanConfidence,
      empirical_hit_rate: empiricalHitRate,
    });
    ece += (inBucket.length / scored.length) * Math.abs(meanConfidence - empiricalHitRate);
  }

  return {
    scored: scored.length,
    mean_confidence: mean(confidences),
    empirical_hit_rate: mean(hits),
    ece,
    buckets,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
