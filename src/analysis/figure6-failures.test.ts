import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import { buildFigure6, figure6ToCsv, figure6ToSvg } from "./figure6-failures.js";

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
    agent_input_tokens: 10,
    agent_output_tokens: 1,
    priced_cost_usd: 0.01,
    provider_reported_cost_usd: null,
    router_latency_ms: null,
    agent_latency_ms: 5,
            total_latency_ms: 20,
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

describe("buildFigure6", () => {
  it("builds expected failure stacks with R0 separate from scientific codes", () => {
    const figure = buildFigure6(
      dataset([
        // baseline N=5: 4 attempts — R0, R2, none, none
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "b0",
          failure_code: "R0",
          routing_excluded: true,
          execution_excluded: true,
          execution_success: false,
        }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "b1",
          failure_code: "R2",
          execution_success: false,
        }),
        attempt({ architecture: "baseline", toolspace_size: 5, task_id: "b2", failure_code: null }),
        attempt({ architecture: "baseline", toolspace_size: 5, task_id: "b3", failure_code: null }),
        // jev N=10: R1 + none
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          task_id: "j0",
          failure_code: "R1",
          execution_success: false,
        }),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          task_id: "j1",
          failure_code: null,
        }),
      ]),
    );

    const baseline = figure.points.find(
      (point) => point.architecture === "baseline" && point.toolspace_size === 5,
    )!;
    expect(baseline.counts).toEqual({
      R0: 1,
      R1: 0,
      R2: 1,
      R3: 0,
      R4: 0,
      R5: 0,
      R6: 0,
      none: 2,
    });
    expect(baseline.infrastructure_failure_rate).toBeCloseTo(0.25);
    expect(baseline.scientific_failure_rate).toBeCloseTo(0.25);
    expect(baseline.rates.R0).toBeCloseTo(0.25);
    expect(baseline.rates.R2).toBeCloseTo(0.25);
    expect(baseline.rates.none).toBeCloseTo(0.5);
    // R0 must not be counted in scientific
    expect(baseline.scientific_failure_rate).toBe(baseline.rates.R1 + baseline.rates.R2);

    const jev = figure.points.find(
      (point) => point.architecture === "jev" && point.toolspace_size === 10,
    )!;
    expect(jev.counts.R1).toBe(1);
    expect(jev.infrastructure_failure_rate).toBe(0);

    expect(figure.active_codes).toEqual(["R0", "R1", "R2", "none"]);
    expect(figure.active_codes).not.toContain("R5");
  });

  it("does not fold R0 into R1", () => {
    const figure = buildFigure6(
      dataset([
        attempt({ failure_code: "R0", routing_excluded: true, execution_excluded: true }),
        attempt({ failure_code: "R0", task_id: "t2", routing_excluded: true, execution_excluded: true }),
      ]),
    );
    const point = figure.points[0]!;
    expect(point.counts.R0).toBe(2);
    expect(point.counts.R1).toBe(0);
    expect(point.infrastructure_failure_rate).toBe(1);
    expect(point.scientific_failure_rate).toBe(0);
  });

  it("csv and svg keep R0 visually/reportingly separate", () => {
    const figure = buildFigure6(
      dataset([
        attempt({ architecture: "baseline", toolspace_size: 5, failure_code: "R0" }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t2",
          failure_code: "R3",
        }),
        attempt({
          architecture: "llm",
          toolspace_size: 5,
          top_k: 3,
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          failure_code: "R4",
        }),
      ]),
    );
    const csv = figure6ToCsv(figure);
    expect(csv).toContain("infrastructure_failure_rate");
    expect(csv).toContain("scientific_failure_rate");
    expect(csv).toContain("count_R0");

    const svg = figure6ToSvg(figure);
    expect(svg).toContain("R0");
    expect(svg).toContain("infrastructure");
    expect(svg).toContain("stroke-dasharray");
    expect(svg.toLowerCase()).not.toContain("relabel");
  });
});
