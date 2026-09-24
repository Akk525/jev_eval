import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import { buildFigure4, figure4ToCsv, figure4ToSvg } from "./figure4-recall.js";

function attempt(overrides: Partial<NormalizedAttempt> = {}): NormalizedAttempt {
  return {
    source_directory: "/tmp/epoch",
    architecture: "jev",
    toolspace_size: 25,
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
    top1_probability: null,
    confidence: null,
    router_input_tokens: 10,
    router_output_tokens: 1,
    agent_input_tokens: 20,
    agent_output_tokens: 2,
    priced_cost_usd: 0.01,
    provider_reported_cost_usd: null,
    router_latency_ms: 5,
    agent_latency_ms: 10,
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

describe("buildFigure4", () => {
  it("emits distinct strict and lenient series across k-ablation points", () => {
    const figure = buildFigure4(
      dataset([
        // jev k=1: strict 0.5, lenient 1.0
        attempt({
          top_k: 1,
          task_id: "j1a",
          recall_at_k: 1,
          lenient_recall_at_k: 1,
        }),
        attempt({
          top_k: 1,
          task_id: "j1b",
          recall_at_k: 0,
          lenient_recall_at_k: 1,
        }),
        // jev k=5: strict 1.0, lenient 1.0
        attempt({
          top_k: 5,
          task_id: "j5a",
          recall_at_k: 1,
          lenient_recall_at_k: 1,
        }),
        attempt({
          top_k: 5,
          task_id: "j5b",
          recall_at_k: 1,
          lenient_recall_at_k: 1,
        }),
        // llm k=5
        attempt({
          architecture: "llm",
          top_k: 5,
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          task_id: "l5a",
          recall_at_k: 0,
          lenient_recall_at_k: 0,
        }),
        // baseline ignored
        attempt({
          architecture: "baseline",
          top_k: null,
          router_provider: null,
          router_model: null,
          task_id: "b1",
          recall_at_k: 1,
          lenient_recall_at_k: 1,
        }),
        // R0 excluded from recall denominator
        attempt({
          top_k: 5,
          task_id: "j5r0",
          routing_excluded: true,
          execution_excluded: true,
          recall_at_k: null,
          lenient_recall_at_k: null,
          failure_code: "R0",
        }),
      ]),
    );

    expect(figure.points).toHaveLength(3);

    const jevK1 = figure.points.find((point) => point.architecture === "jev" && point.top_k === 1)!;
    expect(jevK1.recall_at_k).toBe(0.5);
    expect(jevK1.lenient_recall_at_k).toBe(1);
    expect(jevK1.recall_at_k).not.toBe(jevK1.lenient_recall_at_k);

    const jevK5 = figure.points.find((point) => point.architecture === "jev" && point.top_k === 5)!;
    expect(jevK5.recall_at_k).toBe(1);
    expect(jevK5.routing_scored).toBe(2);

    expect(figure.series.map((series) => series.key)).toEqual([
      "jev-n25-full-strict",
      "jev-n25-full-lenient",
      "llm-n25-full-strict",
      "llm-n25-full-lenient",
    ]);

    const jevStrict = figure.series.find((series) => series.key === "jev-n25-full-strict")!;
    expect(jevStrict.metric).toBe("strict");
    expect(jevStrict.points.map((point) => point.top_k)).toEqual([1, 5]);
    expect(jevStrict.points.map((point) => point.value)).toEqual([0.5, 1]);

    const jevLenient = figure.series.find((series) => series.key === "jev-n25-full-lenient")!;
    expect(jevLenient.metric).toBe("lenient");
    expect(jevLenient.points[0]!.value).toBe(1);
  });

  it("keeps router-only k-sweep cells separate from full-agent", () => {
    const figure = buildFigure4(
      dataset([
        attempt({ top_k: 1, router_only: true, recall_at_k: 0.25, lenient_recall_at_k: 0.5 }),
        attempt({ top_k: 3, router_only: true, recall_at_k: 0.75, lenient_recall_at_k: 1 }),
        attempt({ top_k: 3, router_only: false, recall_at_k: 0.5, lenient_recall_at_k: 0.5 }),
      ]),
    );
    expect(figure.series.map((series) => series.key)).toEqual([
      "jev-n25-full-strict",
      "jev-n25-full-lenient",
      "jev-n25-router-only-strict",
      "jev-n25-router-only-lenient",
    ]);
    const routerOnly = figure.series.find((series) => series.key === "jev-n25-router-only-strict")!;
    expect(routerOnly.points.map((point) => [point.top_k, point.value])).toEqual([
      [1, 0.25],
      [3, 0.75],
    ]);
  });

  it("renders csv/svg without conflating strict and lenient", () => {
    const figure = buildFigure4(
      dataset([
        attempt({ top_k: 1, recall_at_k: 0, lenient_recall_at_k: 1 }),
        attempt({ top_k: 5, recall_at_k: 1, lenient_recall_at_k: 1 }),
      ]),
    );
    const csv = figure4ToCsv(figure);
    expect(csv).toContain("recall_at_k");
    expect(csv).toContain("lenient_recall_at_k");
    expect(csv).not.toContain("acceptable_only_as_primary");

    const svg = figure4ToSvg(figure);
    expect(svg).toContain("strict");
    expect(svg).toContain("lenient");
    expect(svg).toContain("stroke-dasharray");
    expect(svg.toLowerCase()).not.toContain("optimal");
  });
});
