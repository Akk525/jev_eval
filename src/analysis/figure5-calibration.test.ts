import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import { buildFigure5, figure5ToCsv, figure5ToSvg } from "./figure5-calibration.js";

function attempt(overrides: Partial<NormalizedAttempt> = {}): NormalizedAttempt {
  return {
    source_directory: "/tmp/epoch",
    architecture: "jev",
    toolspace_size: 20,
    top_k: 5,
    router_only: false,
    dataset_path: "datasets/v0.2/tasks.jsonl",
    dataset_version: "1",
    registry_hash: "registry-a",
    pricing_version: "v1",
    agent_provider: "openai",
    agent_model: "gpt-5.6-sol",
    agent_temperature: 0,
    router_provider: "typesafe",
    router_model: "jev-1.13.0",
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
    top1_probability: 0.7,
    confidence: 0.8,
    router_input_tokens: 10,
    router_output_tokens: 1,
    agent_input_tokens: 20,
    agent_output_tokens: 2,
    priced_cost_usd: 0.01,
    provider_reported_cost_usd: null,
    router_latency_ms: 5,
    agent_latency_ms: 10,
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

describe("buildFigure5", () => {
  it("hand-checks ECE for confidence and keeps top-1 as a separate series", () => {
    // Same confidence fixture as aggregate.test.ts → ECE 0.05
    // Distinct top-1 values so the two series are not identical.
    const figure = buildFigure5(
      dataset([
        attempt({
          task_id: "a",
          confidence: 0.55,
          top1_probability: 0.4,
          recall_at_k: 0,
        }),
        attempt({
          task_id: "b",
          confidence: 0.55,
          top1_probability: 0.4,
          recall_at_k: 1,
        }),
        attempt({
          task_id: "c",
          confidence: 0.95,
          top1_probability: 0.92,
          recall_at_k: 1,
        }),
        attempt({
          task_id: "d",
          confidence: 0.95,
          top1_probability: 0.92,
          recall_at_k: 1,
        }),
        // missing confidence stays out of confidence denominator only
        attempt({
          task_id: "e",
          confidence: null,
          top1_probability: 0.92,
          recall_at_k: 0,
        }),
        // llm ignored
        attempt({
          architecture: "llm",
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          task_id: "llm",
          confidence: 0.99,
          top1_probability: 0.99,
          recall_at_k: 1,
        }),
      ]),
    );

    expect(figure.architecture).toBe("jev");
    expect(figure.confidence.scored).toBe(4);
    expect(figure.confidence.mean_probability).toBeCloseTo(0.75);
    expect(figure.confidence.empirical_hit_rate).toBe(0.75);
    expect(figure.confidence.buckets).toEqual([
      { range: "0.50-0.60", n: 2, mean_probability: 0.55, empirical_hit_rate: 0.5 },
      { range: "0.90-1.00", n: 2, mean_probability: 0.95, empirical_hit_rate: 1 },
    ]);
    // ECE = 0.5*|0.55-0.5| + 0.5*|0.95-1| = 0.05
    expect(figure.confidence.ece).toBeCloseTo(0.05);

    // top-1: three in 0.90-1.00 (0.92×3 with hits 1,1,0) + two in 0.00-0.50? 0.4 is in 0.00-0.50
    expect(figure.top1_probability.scored).toBe(5);
    expect(figure.top1_probability.ece).not.toBeNull();
    expect(figure.top1_probability.ece).not.toBe(figure.confidence.ece);

    // no combined metric field
    expect(figure).not.toHaveProperty("combined");
    expect(figure).not.toHaveProperty("merged_confidence");
  });

  it("leaves series empty when scores are absent", () => {
    const figure = buildFigure5(
      dataset([
        attempt({
          confidence: null,
          top1_probability: null,
          recall_at_k: 1,
        }),
      ]),
    );
    expect(figure.confidence).toEqual({
      scored: 0,
      mean_probability: null,
      empirical_hit_rate: null,
      ece: null,
      buckets: [],
    });
    expect(figure.top1_probability.scored).toBe(0);
  });

  it("renders separate series in csv and svg", () => {
    const figure = buildFigure5(
      dataset([
        attempt({ confidence: 0.55, top1_probability: 0.4, recall_at_k: 0 }),
        attempt({ confidence: 0.95, top1_probability: 0.9, recall_at_k: 1, task_id: "b" }),
      ]),
    );
    const csv = figure5ToCsv(figure);
    expect(csv).toContain("confidence");
    expect(csv).toContain("top1_probability");
    expect(csv).toContain("ece");

    const svg = figure5ToSvg(figure);
    expect(svg).toContain("confidence");
    expect(svg).toContain("top-1");
    expect(svg).toContain("ECE");
    expect(svg).toContain("stroke-dasharray");
  });
});
