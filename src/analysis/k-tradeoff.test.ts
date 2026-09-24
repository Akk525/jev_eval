import { describe, expect, it } from "vitest";
import {
  K_TRADEOFF_NOTE,
  buildKTradeoffTableFromKSweep,
  buildKTradeoffTableFromLoads,
  kTradeoffTableToCsv,
  kTradeoffTableToJson,
} from "./k-tradeoff.js";
import type { KSweepTables } from "./k-sweep-tables.js";
import type { ResultDirectoryLoad, ScalingRun } from "./scaling-tables.js";
import { K_SWEEP_TOOLSPACE_SIZE } from "../config/k-sweep.js";

function emptyLatency() {
  return { mean: 10, median: 10, p50: 10, p95: 10 };
}

function emptyStats(mean: number | null) {
  return { mean, stddev: null, ci95Low: null, ci95High: null };
}

function kSweepFixture(): KSweepTables {
  return {
    rows: [
      {
        architecture: "jev",
        toolspace_size: 25,
        top_k: 1,
        source_directories: ["/tmp/k1"],
        attempts: 2,
        r0_attempts: 0,
        infrastructure_failure_rate: 0,
        routing_scored: 2,
        recall_at_k: 0.5,
        recall_at_k_stats: emptyStats(0.5),
        selection_scored: 2,
        selection_accuracy: 0.5,
        selection_accuracy_stats: emptyStats(0.5),
        execution_scored: 2,
        execution_success_rate: 0.5,
        execution_success_rate_stats: emptyStats(0.5),
        mean_candidate_count: 1,
        candidate_count_stats: emptyStats(1),
        router_input_tokens: 20,
        router_output_tokens: 2,
        agent_input_tokens: 100,
        agent_output_tokens: 4,
        priced_cost_usd: 0.2,
        router_latency_ms: emptyLatency(),
        agent_latency_ms: emptyLatency(),
      },
      {
        architecture: "jev",
        toolspace_size: 25,
        top_k: 5,
        source_directories: ["/tmp/k5"],
        attempts: 2,
        r0_attempts: 0,
        infrastructure_failure_rate: 0,
        routing_scored: 2,
        recall_at_k: 1,
        recall_at_k_stats: emptyStats(1),
        selection_scored: 2,
        selection_accuracy: 1,
        selection_accuracy_stats: emptyStats(1),
        execution_scored: 2,
        execution_success_rate: 0.75,
        execution_success_rate_stats: emptyStats(0.75),
        mean_candidate_count: 5,
        candidate_count_stats: emptyStats(5),
        router_input_tokens: 20,
        router_output_tokens: 2,
        agent_input_tokens: 400,
        agent_output_tokens: 4,
        priced_cost_usd: 0.6,
        router_latency_ms: emptyLatency(),
        agent_latency_ms: emptyLatency(),
      },
    ],
  };
}

describe("buildKTradeoffTable", () => {
  it("projects k vs recall vs context vs ESR vs cost without an optimal k", () => {
    const table = buildKTradeoffTableFromKSweep(kSweepFixture());
    expect(table.decision_rule).toBeNull();
    expect(table.note).toBe(K_TRADEOFF_NOTE);
    expect(table).not.toHaveProperty("optimal_k");
    expect(JSON.stringify(table)).not.toMatch(/"optimal_k"/);

    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      top_k: 1,
      recall_at_k: 0.5,
      mean_candidate_count: 1,
      agent_input_tokens_per_attempt: 50,
      execution_success_rate: 0.5,
      priced_cost_usd_per_attempt: 0.1,
      delta_vs_previous_k: null,
    });
    expect(table.rows[1]).toMatchObject({
      top_k: 5,
      recall_at_k: 1,
      mean_candidate_count: 5,
      agent_input_tokens_per_attempt: 200,
      execution_success_rate: 0.75,
      priced_cost_usd_per_attempt: 0.3,
    });
    expect(table.rows[1]!.delta_vs_previous_k).toMatchObject({
      recall_at_k: 0.5,
      mean_candidate_count: 4,
      agent_input_tokens_per_attempt: 150,
      execution_success_rate: 0.25,
    });
    expect(table.rows[1]!.delta_vs_previous_k!.priced_cost_usd_per_attempt).toBeCloseTo(0.2);
  });

  it("recomputes from raw result loads and keeps csv free of winner claims", () => {
    function run(overrides: Partial<ScalingRun> = {}): ScalingRun {
      return {
        repetition: 0,
        routingExcluded: false,
        executionExcluded: false,
        executionSuccess: true,
        failureCode: null,
        recallAtK: 1,
        confidence: 0.8,
        selectionAccuracy: 1,
        candidates: ["a"],
        routerUsage: { inputTokens: 10, outputTokens: 0 },
        agentUsage: { inputTokens: 40, outputTokens: 0 },
        pricedCostUsd: 0.05,
        providerReportedCostUsd: null,
        routerLatencyMs: 5,
        agentLatencyMs: 15,
        ...overrides,
      };
    }

    function config(topK: number) {
      return {
        architecture: "jev" as const,
        toolspaceSize: K_SWEEP_TOOLSPACE_SIZE,
        topK,
        datasetPath: "datasets/v0.2/tasks.jsonl",
        repetitions: 1,
        concurrency: 1,
        seed: 0,
        agent: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
        router: { provider: "typesafe", model: "jev-1.13.0" },
        escalateRouter: null,
        adaptivePolicyPath: null,
        pricingVersion: "v1",
        tracing: "noop" as const,
        routerOnly: false,
      };
    }

    const loads: ResultDirectoryLoad[] = [
      {
        directory: "/tmp/k1",
        config: config(1),
        runs: [run({ candidates: ["a"], recallAtK: 0, executionSuccess: false, failureCode: "R2" })],
      },
      {
        directory: "/tmp/k3",
        config: config(3),
        runs: [run({ candidates: ["a", "b", "c"], recallAtK: 1, agentUsage: { inputTokens: 120, outputTokens: 0 } })],
      },
    ];

    const table = buildKTradeoffTableFromLoads(loads);
    expect(table.rows.map((row) => row.top_k)).toEqual([1, 3]);
    expect(table.rows[0]!.recall_at_k).toBe(0);
    expect(table.rows[1]!.recall_at_k).toBe(1);
    expect(table.rows[1]!.mean_candidate_count).toBe(3);
    expect(table.rows[1]!.delta_vs_previous_k?.recall_at_k).toBe(1);

    const json = kTradeoffTableToJson(table);
    expect(json).toContain(K_TRADEOFF_NOTE);
    expect(json).toContain('"decision_rule": null');
    expect(json).not.toMatch(/optimal_k/);

    const csv = kTradeoffTableToCsv(table);
    expect(csv.startsWith(`# ${K_TRADEOFF_NOTE}`)).toBe(true);
    expect(csv).toContain("delta_recall_at_k");
    expect(csv).not.toMatch(/optimal_k|winning_k/i);
  });
});
