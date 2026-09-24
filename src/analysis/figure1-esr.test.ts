import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import {
  buildFigure1,
  figure1ToCsv,
  figure1ToSvg,
} from "./figure1-esr.js";

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
    repetitions_configured: 3,
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

describe("buildFigure1", () => {
  it("emits expected ESR series points from a fixture analysis dataset", () => {
    const figure = buildFigure1(
      dataset([
        // baseline N=5: 1 success, 1 fail → 0.5
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t1",
          execution_success: true,
        }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t2",
          execution_success: false,
          failure_code: "R2",
        }),
        // R0 excluded from ESR denominator
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t3",
          execution_excluded: true,
          routing_excluded: true,
          execution_success: false,
          failure_code: "R0",
        }),
        // jev N=10: all success
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          task_id: "t4",
          execution_success: true,
        }),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          task_id: "t5",
          execution_success: true,
        }),
        // llm N=10
        attempt({
          architecture: "llm",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          task_id: "t6",
          execution_success: false,
          failure_code: "R4",
        }),
        // router-only ignored
        attempt({
          architecture: "jev",
          toolspace_size: 25,
          top_k: 5,
          router_only: true,
          execution_excluded: true,
          task_id: "t7",
        }),
      ]),
    );

    expect(figure.metric).toBe("execution_success_rate");
    expect(figure.series.map((series) => series.architecture)).toEqual([
      "baseline",
      "jev",
      "llm",
    ]);

    const baseline = figure.series[0]!.points[0]!;
    expect(baseline).toMatchObject({
      architecture: "baseline",
      toolspace_size: 5,
      attempts: 3,
      execution_scored: 2,
      execution_success_rate: 0.5,
      repetitions: 1,
      ci95_low: null,
      ci95_high: null,
    });

    const jev = figure.series[1]!.points[0]!;
    expect(jev.execution_success_rate).toBe(1);
    expect(jev.toolspace_size).toBe(10);

    const llm = figure.series[2]!.points[0]!;
    expect(llm.execution_success_rate).toBe(0);

    // router-only N=25 must not appear
    expect(figure.series[1]!.points.map((point) => point.toolspace_size)).toEqual([10]);
  });

  it("adds repetition CI when multiple repetition indexes exist", () => {
    const figure = buildFigure1(
      dataset([
        attempt({ architecture: "baseline", toolspace_size: 5, repetition: 0, execution_success: true }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          repetition: 0,
          task_id: "t2",
          execution_success: true,
        }),
        attempt({ architecture: "baseline", toolspace_size: 5, repetition: 1, execution_success: false }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          repetition: 1,
          task_id: "t4",
          execution_success: false,
        }),
        attempt({ architecture: "baseline", toolspace_size: 5, repetition: 2, execution_success: true }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          repetition: 2,
          task_id: "t6",
          execution_success: false,
        }),
      ]),
    );

    const point = figure.series[0]!.points[0]!;
    // overall: 3/6 = 0.5
    expect(point.execution_success_rate).toBe(0.5);
    // per-rep: 1.0, 0.0, 0.5 → mean 0.5
    expect(point.repetitions).toBe(3);
    expect(point.by_repetition_mean).toBeCloseTo(0.5);
    expect(point.by_repetition_stddev).not.toBeNull();
    expect(point.ci95_low).not.toBeNull();
    expect(point.ci95_high).not.toBeNull();
    expect(point.ci95_low!).toBeLessThan(point.by_repetition_mean!);
    expect(point.ci95_high!).toBeGreaterThan(point.by_repetition_mean!);
  });

  it("refuses mixed top_k within one architecture × N cell", () => {
    expect(() =>
      buildFigure1(
        dataset([
          attempt({ architecture: "jev", toolspace_size: 10, top_k: 3 }),
          attempt({ architecture: "jev", toolspace_size: 10, top_k: 5, task_id: "t2" }),
        ]),
      ),
    ).toThrow(/top_k mismatch/);
  });

  it("writes csv and svg without claims beyond the numbers", () => {
    const figure = buildFigure1(
      dataset([
        attempt({ architecture: "baseline", toolspace_size: 5, execution_success: true }),
        attempt({
          architecture: "jev",
          toolspace_size: 5,
          top_k: 3,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          execution_success: false,
          failure_code: "R2",
        }),
      ]),
    );
    const csv = figure1ToCsv(figure);
    expect(csv).toContain("architecture,toolspace_size");
    expect(csv).toContain("baseline,5");
    expect(csv.toLowerCase()).not.toContain("optimal");

    const svg = figure1ToSvg(figure);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Execution Success Rate");
    expect(svg).toContain("baseline");
    expect(svg).toContain("jev");
  });
});
