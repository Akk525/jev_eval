import { expect, it } from "vitest";
import {
  aggregateByRepetition,
  aggregateRuns,
  calibrateConfidence,
  type AggregateRun,
} from "./aggregate.js";

function run(overrides: Partial<AggregateRun> = {}): AggregateRun {
  return {
    repetition: 0,
    routingExcluded: false,
    executionExcluded: false,
    executionSuccess: true,
    failureCode: null,
    recallAtK: 1,
    confidence: 0.8,
    routerUsage: { inputTokens: 100, outputTokens: 0 },
    agentUsage: { inputTokens: 0, outputTokens: 0 },
    pricedCostUsd: 0.01,
    providerReportedCostUsd: null,
    routerLatencyMs: 10,
    agentLatencyMs: null,
    totalLatencyMs: 25,
    ...overrides,
  };
}

it("recomputes mean recall and priced cost from known fixture hits", () => {
  const runs = [
    run({ recallAtK: 1, pricedCostUsd: 0.01, routerUsage: { inputTokens: 1_000_000, outputTokens: 0 } }),
    run({ recallAtK: 0, pricedCostUsd: 0.02, routerUsage: { inputTokens: 2_000_000, outputTokens: 0 } }),
    run({
      routingExcluded: true,
      executionExcluded: true,
      failureCode: "R0",
      recallAtK: null,
      confidence: null,
      pricedCostUsd: 0,
      routerUsage: { inputTokens: 0, outputTokens: 0 },
      routerLatencyMs: null,
      totalLatencyMs: 3,
    }),
  ];
  const summary = aggregateRuns(runs);
  expect(summary.attempts).toBe(3);
  expect(summary.r0_attempts).toBe(1);
  expect(summary.routing_scored).toBe(2);
  expect(summary.recall_at_k).toBe(0.5);
  expect(summary.priced_cost_usd).toBeCloseTo(0.03);
  expect(summary.router_input_tokens).toBe(3_000_000);
  expect(summary.execution_success_rate).toBe(1);
  expect(summary.router_latency_ms).toEqual({ mean: 10, median: 10, p50: 10, p95: 10 });
  expect(summary.agent_latency_ms.mean).toBeNull();
  // Non-R0 totals only (25+25); R0 wall time stays in total_latency_ms_r0.
  expect(summary.total_latency_ms).toEqual({ mean: 25, median: 25, p50: 25, p95: 25 });
  expect(summary.total_latency_ms_r0).toEqual({ mean: 3, median: 3, p50: 3, p95: 3 });
  // R0 is out of both sample denominators. Recall samples are [1, 0].
  expect(summary.recall_at_k_stats.mean).toBe(0.5);
  expect(summary.recall_at_k_stats.stddev).toBeCloseTo(Math.SQRT1_2);
  expect(summary.recall_at_k_stats.ci95Low).toBeCloseTo(0.5 - (1.96 * Math.SQRT1_2) / Math.sqrt(2));
  expect(summary.recall_at_k_stats.ci95High).toBeCloseTo(0.5 + (1.96 * Math.SQRT1_2) / Math.sqrt(2));
  expect(summary.execution_success_rate_stats).toEqual({
    mean: 1,
    stddev: 0,
    ci95Low: 1,
    ci95High: 1,
  });
  expect(summary.by_repetition).toBeNull();
});

it("keeps R0 out of sample mean, stddev, and 95% CI for quality metrics", () => {
  // Scored outcomes 1, 0, 1 → mean 2/3. The R0 line must not enter the sample.
  // sample variance = ((1/3)^2 + (2/3)^2 + (1/3)^2) / 2 = (6/9)/2 = 1/3 → stddev = √(1/3)
  const runs = [
    run({ executionSuccess: true, recallAtK: 1 }),
    run({ executionSuccess: false, recallAtK: 0 }),
    run({ executionSuccess: true, recallAtK: 1 }),
    run({
      routingExcluded: true,
      executionExcluded: true,
      executionSuccess: false,
      failureCode: "R0",
      recallAtK: 0,
      confidence: null,
    }),
  ];
  const summary = aggregateRuns(runs);
  expect(summary.r0_attempts).toBe(1);
  expect(summary.execution_scored).toBe(3);
  expect(summary.execution_success_rate).toBeCloseTo(2 / 3);
  expect(summary.execution_success_rate_stats.mean).toBeCloseTo(2 / 3);
  expect(summary.execution_success_rate_stats.stddev).toBeCloseTo(Math.sqrt(1 / 3));
  expect(summary.recall_at_k_stats.mean).toBeCloseTo(2 / 3);
  expect(summary.recall_at_k_stats.ci95Low).toBeCloseTo(2 / 3 - (1.96 * Math.sqrt(1 / 3)) / Math.sqrt(3));
  expect(summary.recall_at_k_stats.ci95High).toBeCloseTo(2 / 3 + (1.96 * Math.sqrt(1 / 3)) / Math.sqrt(3));
});

it("summarizes per-repetition quality rates across end-to-end repetitions", () => {
  // Rep 0: ESR 0.5 (1/2), recall mean 0.5. Rep 1: ESR 1.0 (1/1 scored; one R0), recall 1.0.
  // Rep 2: ESR 0.0 (0/1), recall 0.0.
  const runs = [
    run({ repetition: 0, executionSuccess: true, recallAtK: 1 }),
    run({ repetition: 0, executionSuccess: false, recallAtK: 0 }),
    run({ repetition: 1, executionSuccess: true, recallAtK: 1 }),
    run({
      repetition: 1,
      routingExcluded: true,
      executionExcluded: true,
      failureCode: "R0",
      recallAtK: null,
      confidence: null,
    }),
    run({ repetition: 2, executionSuccess: false, recallAtK: 0 }),
  ];
  const byRep = aggregateByRepetition(runs);
  expect(byRep).not.toBeNull();
  expect(byRep!.repetitions).toBe(3);
  expect(byRep!.execution_success_rate.mean).toBeCloseTo((0.5 + 1 + 0) / 3);
  expect(byRep!.recall_at_k.mean).toBeCloseTo((0.5 + 1 + 0) / 3);
  // sample stddev of [0.5, 1, 0]: mean 0.5, variance = ((0)^2+(0.5)^2+(0.5)^2)/2 = 0.25, stddev 0.5
  expect(byRep!.execution_success_rate.stddev).toBeCloseTo(0.5);
  expect(byRep!.execution_success_rate.ci95Low).toBeCloseTo(0.5 - (1.96 * 0.5) / Math.sqrt(3));
  expect(byRep!.execution_success_rate.ci95High).toBeCloseTo(0.5 + (1.96 * 0.5) / Math.sqrt(3));

  const summary = aggregateRuns(runs);
  expect(summary.by_repetition).toEqual(byRep);
  // Pooled ESR still excludes the R0 attempt: 2 successes / 4 scored.
  expect(summary.execution_success_rate).toBe(0.5);
  expect(summary.r0_attempts).toBe(1);
});

it("leaves by_repetition null when only one repetition index exists", () => {
  expect(aggregateByRepetition([run(), run({ executionSuccess: false })])).toBeNull();
});

it("calibrates confidence buckets against empirical recall hits", () => {
  const runs = [
    run({ confidence: 0.55, recallAtK: 0 }),
    run({ confidence: 0.55, recallAtK: 1 }),
    run({ confidence: 0.95, recallAtK: 1 }),
    run({ confidence: 0.95, recallAtK: 1 }),
  ];
  const calibration = calibrateConfidence(runs);
  expect(calibration.scored).toBe(4);
  expect(calibration.mean_confidence).toBeCloseTo(0.75);
  expect(calibration.empirical_hit_rate).toBe(0.75);
  expect(calibration.buckets).toEqual([
    { range: "0.50-0.60", n: 2, mean_confidence: 0.55, empirical_hit_rate: 0.5 },
    { range: "0.90-1.00", n: 2, mean_confidence: 0.95, empirical_hit_rate: 1 },
  ]);
  // ECE = 0.5*|0.55-0.5| + 0.5*|0.95-1| = 0.025 + 0.025 = 0.05
  expect(calibration.ece).toBeCloseTo(0.05);
});

it("leaves calibration empty when confidence is absent", () => {
  const summary = aggregateRuns([run({ confidence: null, recallAtK: 1 })]);
  expect(summary.calibration).toEqual({
    scored: 0,
    mean_confidence: null,
    empirical_hit_rate: null,
    ece: null,
    buckets: [],
  });
});
