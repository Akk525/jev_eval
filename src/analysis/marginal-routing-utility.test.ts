import { describe, expect, it } from "vitest";
import {
  MARGINAL_K_TRANSITIONS,
  MARGINAL_ROUTING_UTILITY_NOTE,
  buildMarginalRoutingUtilityFromLoads,
  marginalRoutingUtilityToCsv,
  marginalRoutingUtilityToJson,
} from "./marginal-routing-utility.js";
import type { ResultDirectoryLoad, ScalingRun } from "./scaling-tables.js";
import { K_SWEEP_TOOLSPACE_SIZE } from "../config/k-sweep.js";

function run(overrides: Partial<ScalingRun> & { taskId: string }): ScalingRun {
  const { taskId, ...rest } = overrides;
  return {
    taskId,
    repetition: 0,
    routingExcluded: false,
    executionExcluded: false,
    executionSuccess: true,
    failureCode: null,
    recallAtK: 1,
    confidence: 0.8,
    selectionAccuracy: 1,
    candidates: ["gold"],
    lenientRecallAtK: 1,
    routerUsage: { inputTokens: 10, outputTokens: 1 },
    agentUsage: { inputTokens: 100, outputTokens: 2 },
    pricedCostUsd: 0.05,
    providerReportedCostUsd: null,
    routerLatencyMs: 5,
    agentLatencyMs: 20,
    totalLatencyMs: 25,
    ...rest,
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

function load(topK: number, runs: ScalingRun[]): ResultDirectoryLoad {
  return { directory: `/tmp/jev-k${topK}`, config: config(topK), runs };
}

describe("buildMarginalRoutingUtility", () => {
  it("reports adjacent transitions distinguishing coverage from utility", () => {
    const loads: ResultDirectoryLoad[] = [
      load(1, [
        run({ taskId: "t_new_cover_ok", recallAtK: 0, executionSuccess: false, failureCode: "R1" }),
        run({ taskId: "t_new_cover_fail", recallAtK: 0, executionSuccess: false, failureCode: "R1" }),
        run({
          taskId: "t_regress",
          recallAtK: 1,
          executionSuccess: true,
          selectionAccuracy: 1,
          agentUsage: { inputTokens: 50, outputTokens: 0 },
          pricedCostUsd: 0.04,
          totalLatencyMs: 20,
        }),
        run({
          taskId: "t_stable",
          recallAtK: 1,
          executionSuccess: true,
          selectionAccuracy: 1,
          agentUsage: { inputTokens: 50, outputTokens: 0 },
          pricedCostUsd: 0.04,
          totalLatencyMs: 20,
        }),
      ]),
      load(3, [
        run({
          taskId: "t_new_cover_ok",
          recallAtK: 1,
          executionSuccess: true,
          selectionAccuracy: 1,
          failureCode: null,
          agentUsage: { inputTokens: 150, outputTokens: 0 },
          pricedCostUsd: 0.06,
          totalLatencyMs: 30,
        }),
        run({
          taskId: "t_new_cover_fail",
          recallAtK: 1,
          executionSuccess: false,
          failureCode: "R2",
          selectionAccuracy: 0,
          agentUsage: { inputTokens: 150, outputTokens: 0 },
          pricedCostUsd: 0.06,
          totalLatencyMs: 30,
        }),
        run({
          taskId: "t_regress",
          recallAtK: 1,
          executionSuccess: false,
          failureCode: "R2",
          selectionAccuracy: 0,
          agentUsage: { inputTokens: 150, outputTokens: 0 },
          pricedCostUsd: 0.06,
          totalLatencyMs: 30,
        }),
        run({
          taskId: "t_stable",
          recallAtK: 1,
          executionSuccess: true,
          selectionAccuracy: 1,
          agentUsage: { inputTokens: 150, outputTokens: 0 },
          pricedCostUsd: 0.06,
          totalLatencyMs: 30,
        }),
      ]),
      // Stub remaining cells so all three transitions validate.
      load(5, [
        run({ taskId: "t_new_cover_ok", recallAtK: 1 }),
        run({ taskId: "t_new_cover_fail", recallAtK: 1 }),
        run({ taskId: "t_regress", recallAtK: 1 }),
        run({ taskId: "t_stable", recallAtK: 1 }),
      ]),
      load(10, [
        run({ taskId: "t_new_cover_ok", recallAtK: 1 }),
        run({ taskId: "t_new_cover_fail", recallAtK: 1 }),
        run({ taskId: "t_regress", recallAtK: 1 }),
        run({ taskId: "t_stable", recallAtK: 1 }),
      ]),
    ];

    const report = buildMarginalRoutingUtilityFromLoads(loads);
    expect(report.decision_rule).toBeNull();
    expect(report.note).toBe(MARGINAL_ROUTING_UTILITY_NOTE);
    expect(report.transitions.map((t) => [t.from_k, t.to_k])).toEqual(
      MARGINAL_K_TRANSITIONS.map(([a, b]) => [a, b]),
    );

    const first = report.transitions[0]!;
    expect(first.paired_tasks).toBe(4);
    expect(first.additional_routing_coverage).toBe(2);
    expect(first.additional_coverage_that_succeed).toBe(1);
    expect(first.previously_successful_become_failures).toBe(1);
    expect(first.r1_reduction).toBe(2); // 2 R1 at k=1 → 0 at k=3
    expect(first.r2_change).toBe(2); // 0 → 2
    expect(first.additional_coverage_task_ids).toEqual(["t_new_cover_fail", "t_new_cover_ok"]);
    expect(first.additional_coverage_success_task_ids).toEqual(["t_new_cover_ok"]);
    expect(first.regression_task_ids).toEqual(["t_regress"]);
    // k1 agent tokens mean (100+2)+(100+2)+(50+0)+(50+0) / 4 = 76; k3 all 150 → delta 74
    expect(first.agent_tokens_change).toBe(74);
    expect(first.cost_change).toBeCloseTo(0.06 - (0.05 + 0.05 + 0.04 + 0.04) / 4);

    const json = marginalRoutingUtilityToJson(report);
    expect(json).not.toMatch(/"optimal_k"/);
    const csv = marginalRoutingUtilityToCsv(report);
    expect(csv).toContain("additional_routing_coverage");
    expect(csv).toContain("1,3,");
  });
});
