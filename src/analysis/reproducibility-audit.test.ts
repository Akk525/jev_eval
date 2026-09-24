import { describe, expect, it } from "vitest";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";
import { M5_SKIP_REASON } from "./dataset.js";
import { runReproducibilityAudit } from "./reproducibility-audit.js";

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
    git_sha: "abc1234",
    config_hash: "hash-a",
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

describe("runReproducibilityAudit", () => {
  it("passes when the analysis dataset can regenerate figures 1–6", () => {
    const report = runReproducibilityAudit({
      dataset: dataset([
        attempt(),
        attempt({
          architecture: "jev",
          toolspace_size: 10,
          top_k: 5,
          router_provider: "typesafe",
          router_model: "jev-1.13.0",
          task_id: "t2",
          confidence: 0.8,
          top1_probability: 0.7,
          router_latency_ms: 4,
        }),
      ]),
      now: () => new Date("2026-09-23T12:00:00.000Z"),
    });
    expect(report.pass).toBe(true);
    expect(report.numbers_status).toBe("present");
    expect(report.figures.figure1?.ok).toBe(true);
    expect(report.figures.figure6?.ok).toBe(true);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails when attempts lack provenance fields", () => {
    const bad = dataset([attempt({ config_hash: "" })]);
    const report = runReproducibilityAudit({ dataset: bad });
    expect(report.pass).toBe(false);
    expect(report.checks.find((check) => check.id === "attempt_provenance_fields")?.ok).toBe(
      false,
    );
  });

  it("fails when the dataset has zero attempts", () => {
    const report = runReproducibilityAudit({ dataset: dataset([]) });
    expect(report.pass).toBe(false);
    expect(report.numbers_status).toBe("unavailable");
  });
});
