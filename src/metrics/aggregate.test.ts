import { expect, it } from "vitest";
import { aggregateRuns, calibrateConfidence, type AggregateRun } from "./aggregate.js";

function run(overrides: Partial<AggregateRun> = {}): AggregateRun {
  return {
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
