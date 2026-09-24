import { describe, expect, it } from "vitest";
import { summarizeLatency } from "../metrics/metrics.js";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import { buildFigure3, figure3ToCsv, figure3ToSvg } from "./figure3-latency.js";

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

describe("buildFigure3", () => {
  it("emits expected latency percentiles from a fixture series", () => {
    // agent latencies: 10,20,30,40,50 → mean 30, p50 30, p95 50
    const agentMs = [10, 20, 30, 40, 50];
    const expectedAgent = summarizeLatency(agentMs);
    // jev: router [5,15,25,35,45] + agent [10,20,30,40,50] → totals [15,35,55,75,95]
    const routerMs = [5, 15, 25, 35, 45];
    const totals = routerMs.map((router, index) => router + agentMs[index]!);
    const expectedTotal = summarizeLatency(totals);
    const expectedRouter = summarizeLatency(routerMs);

    const figure = buildFigure3(
      dataset([
        ...agentMs.map((ms, index) =>
          attempt({
            architecture: "baseline",
            toolspace_size: 5,
            task_id: `b${index}`,
            agent_latency_ms: ms,
            router_latency_ms: null,
          }),
        ),
        ...routerMs.map((ms, index) =>
          attempt({
            architecture: "jev",
            toolspace_size: 10,
            top_k: 5,
            task_id: `j${index}`,
            router_provider: "typesafe",
            router_model: "jev-1.13.0",
            router_latency_ms: ms,
            agent_latency_ms: agentMs[index]!,
          }),
        ),
        // router-only ignored
        attempt({
          architecture: "jev",
          toolspace_size: 25,
          top_k: 5,
          router_only: true,
          router_latency_ms: 999,
          agent_latency_ms: null,
        }),
      ]),
    );

    expect(figure.series.map((series) => series.architecture)).toEqual(["baseline", "jev"]);

    const baseline = figure.series[0]!.points[0]!;
    expect(baseline.agent.mean).toBeCloseTo(expectedAgent.mean!);
    expect(baseline.agent.p50).toBe(expectedAgent.p50);
    expect(baseline.agent.p95).toBe(expectedAgent.p95);
    expect(baseline.total.p50).toBe(expectedAgent.p50);
    expect(baseline.total.p95).toBe(expectedAgent.p95);
    expect(baseline.router.n).toBe(0);
    expect(baseline.tool_latency).toBe("unavailable");

    const jev = figure.series[1]!.points[0]!;
    expect(jev.router.p50).toBe(expectedRouter.p50);
    expect(jev.router.p95).toBe(expectedRouter.p95);
    expect(jev.total.mean).toBeCloseTo(expectedTotal.mean!);
    expect(jev.total.p50).toBe(expectedTotal.p50);
    expect(jev.total.p95).toBe(expectedTotal.p95);
    expect(jev.toolspace_size).toBe(10);
  });

  it("csv and svg expose distribution stats, not mean alone", () => {
    const figure = buildFigure3(
      dataset([
        attempt({ architecture: "baseline", toolspace_size: 5, agent_latency_ms: 10 }),
        attempt({
          architecture: "baseline",
          toolspace_size: 5,
          task_id: "t2",
          agent_latency_ms: 50,
        }),
        attempt({
          architecture: "llm",
          toolspace_size: 5,
          top_k: 3,
          router_provider: "openai",
          router_model: "gpt-5.6-sol",
          router_latency_ms: 20,
          agent_latency_ms: 30,
        }),
      ]),
    );
    const csv = figure3ToCsv(figure);
    expect(csv).toContain("total_p50");
    expect(csv).toContain("total_p95");
    expect(csv).toContain("total_mean");
    expect(csv).toContain("unavailable");

    const svg = figure3ToSvg(figure);
    expect(svg).toContain("p50");
    expect(svg).toContain("p95");
    expect(svg).toContain("baseline");
    expect(svg).toContain("llm");
    expect(svg.toLowerCase()).not.toContain("winner");
  });
});
