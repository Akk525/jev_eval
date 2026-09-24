import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import {
  buildFigure2Cost,
  buildFigure2Tokens,
  figure2CostToCsv,
  figure2TokensToCsv,
  figure2TokensToSvg,
} from "./figure2-cost-tokens.js";

function attempt(overrides: Partial<NormalizedAttempt> = {}): NormalizedAttempt {
  return {
    source_directory: "/tmp/epoch",
    architecture: "baseline",
    toolspace_size: 5,
    top_k: null,
    router_only: false,
    dataset_path: "datasets/v0.2/tasks.jsonl",
    dataset_version: "1",
    registry_hash: "registry-a",
    pricing_version: "v1",
    agent_provider: "openai",
    agent_model: "gpt-5.6-sol",
    agent_temperature: 0,
    router_provider: null,
    router_model: null,
    git_sha: "abc",
    config_hash: "hash",
    seed: 0,
    tracing: "noop",
    repetitions_configured: 1,
    concurrency: 1,
    task_id: "task_0001",
    repetition: 0,
    toolspace: ["gold"],
    candidates: ["gold"],
    scores: null,
    top1_probability: null,
    confidence: null,
    router_input_tokens: 0,
    router_output_tokens: 0,
    agent_input_tokens: 100,
    agent_output_tokens: 20,
    priced_cost_usd: 0.02,
    provider_reported_cost_usd: null,
    router_latency_ms: null,
    agent_latency_ms: 5,
    recall_at_k: 1,
    lenient_recall_at_k: 1,
    selection_accuracy: 1,
    execution_excluded: false,
    routing_excluded: false,
    execution_success: true,
    failure_code: null,
    infrastructure_reason: null,
    ...overrides,
  };
}

function dataset(attempts: NormalizedAttempt[]): AnalysisDataset {
  return {
    version: 1,
    built_at: "2026-09-23T12:00:00.000Z",
    results_root: "/tmp/results",
    compatibility: {
      datasetPath: "datasets/v0.2/tasks.jsonl",
      datasetVersion: "1",
      registryHash: "registry-a",
      pricingVersion: "v1",
      agentProvider: "openai",
      agentModel: "gpt-5.6-sol",
      agentTemperature: 0,
      seed: 0,
      tracing: "noop",
    },
    source_directories: ["/tmp/epoch"],
    m5_adaptive_tables: "skipped",
    m5_skip_reason: M5_SKIP_REASON,
    attempt_count: attempts.length,
    attempts,
  };
}

describe("buildFigure2Cost / buildFigure2Tokens", () => {
  it("computes expected cost and token points from known fixture counts", () => {
    const figureCost = buildFigure2Cost(
      dataset([
        // baseline N=5: two attempts, priced 0.02 + 0.04 = 0.06 → 0.03/task
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          priced_cost_usd: 0.02,
          agent_input_tokens: 100,
          agent_output_tokens: 20,
          provider_reported_cost_usd: 0.025,
        }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t2",
          priced_cost_usd: 0.04,
          agent_input_tokens: 200,
          agent_output_tokens: 40,
          provider_reported_cost_usd: null,
        }),
        // jev N=10: router + agent tokens
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          router_input_tokens: 50,
          router_output_tokens: 10,
          agent_input_tokens: 80,
          agent_output_tokens: 10,
          priced_cost_usd: 0.01,
        }),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          task_id: "t4",
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          router_input_tokens: 50,
          router_output_tokens: 10,
          agent_input_tokens: 80,
          agent_output_tokens: 10,
          priced_cost_usd: 0.01,
        }),
        // llm N=10
        attempt({
          architecture: "llm",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          router_input_tokens: 40,
          router_output_tokens: 5,
          agent_input_tokens: 90,
          agent_output_tokens: 15,
          priced_cost_usd: 0.015,
        }),
        // router-only ignored
        attempt({
          architecture: "jev",
          toolspace_size: 25,
          top_k: 5,
          router_only: true,
          priced_cost_usd: 9.99,
          router_input_tokens: 999,
        }),
      ]),
    );

    expect(figureCost.pricing_version).toBe("v1");
    expect(figureCost.series.map((series) => series.architecture)).toEqual([
      "baseline",
      "jev",
      "llm",
    ]);

    const baseline = figureCost.series[0]!.points[0]!;
    expect(baseline.priced_cost_usd_total).toBeCloseTo(0.06);
    expect(baseline.priced_cost_usd_per_task).toBeCloseTo(0.03);
    expect(baseline.provider_reported_cost_usd_total).toBeCloseTo(0.025);
    expect(baseline.provider_reported_attempts).toBe(1);

    const jevCost = figureCost.series[1]!.points[0]!;
    expect(jevCost.priced_cost_usd_per_task).toBeCloseTo(0.01);
    expect(jevCost.toolspace_size).toBe(10);

    const tokens = buildFigure2Tokens(
      dataset([
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          agent_input_tokens: 100,
          agent_output_tokens: 20,
        }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t2",
          agent_input_tokens: 200,
          agent_output_tokens: 40,
        }),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          router_input_tokens: 50,
          router_output_tokens: 10,
          agent_input_tokens: 80,
          agent_output_tokens: 10,
        }),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          task_id: "t4",
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          router_input_tokens: 50,
          router_output_tokens: 10,
          agent_input_tokens: 80,
          agent_output_tokens: 10,
        }),
      ]),
    );

    const baselineTokens = tokens.points.find(
      (point) => point.architecture === "baseline" && point.toolspace_size === 5,
    )!;
    // (100+20 + 200+40) / 2 = 180
    expect(baselineTokens.agent_tokens).toBe(360);
    expect(baselineTokens.agent_tokens_per_task).toBe(180);
    expect(baselineTokens.router_tokens).toBe(0);

    const jevTokens = tokens.points.find(
      (point) => point.architecture === "jev" && point.toolspace_size === 10,
    )!;
    expect(jevTokens.router_tokens).toBe(120); // 2 * (50+10)
    expect(jevTokens.router_tokens_per_task).toBe(60);
    expect(jevTokens.agent_tokens_per_task).toBe(90);

    expect(tokens.series.map((series) => series.key)).toEqual([
      "baseline-agent",
      "jev-router",
      "jev-agent",
    ]);
  });

  it("keeps provider-reported cost labeled and out of the priced series", () => {
    const cost = buildFigure2Cost(
      dataset([
        attempt({
          priced_cost_usd: 0.01,
          provider_reported_cost_usd: 0.99,
        }),
      ]),
    );
    const point = cost.series[0]!.points[0]!;
    expect(point.priced_cost_usd_per_task).toBeCloseTo(0.01);
    expect(point.provider_reported_cost_usd_total).toBeCloseTo(0.99);
    const csv = figure2CostToCsv(cost);
    expect(csv).toContain("priced_cost_usd_per_task");
    expect(csv).toContain("provider_reported_cost_usd_total");
  });

  it("renders token svg with distinct router vs agent series", () => {
    const tokens = buildFigure2Tokens(
      dataset([
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_input_tokens: 30,
          router_output_tokens: 5,
          agent_input_tokens: 70,
          agent_output_tokens: 10,
        }),
      ]),
    );
    const csv = figure2TokensToCsv(tokens);
    expect(csv).toContain("router_tokens_per_task");
    expect(csv).toContain("agent_tokens_per_task");
    const svg = figure2TokensToSvg(tokens);
    expect(svg).toContain("jev-router");
    expect(svg).toContain("jev-agent");
    expect(svg).toContain("stroke-dasharray");
  });
});
