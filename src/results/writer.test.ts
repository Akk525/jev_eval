import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { ExperimentConfig } from "../types/config.js";
import { openResultDirectory, type ResultDirectoryRequest, type RunRecord } from "./writer.js";

function request(root: string, overrides: Partial<ResultDirectoryRequest> = {}): ResultDirectoryRequest {
  const config: ExperimentConfig = {
    architecture: "mock",
    toolspaceSize: 5,
    topK: 1,
    datasetPath: "datasets/fixtures/smoke.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "mock", model: "mock-agent", temperature: 0 },
    router: null,
    pricingVersion: "v1",
    tracing: "noop",
  };
  return {
    root,
    timestamp: "2026-09-23T150000Z",
    config,
    configHash: "hash-a",
    datasetVersion: "v0.1",
    registryHash: "registry-a",
    gitSha: "abc1234",
    ...overrides,
  };
}

function run(taskId: string, repetition = 0): RunRecord {
  return {
    taskId,
    repetition,
    executionExcluded: false,
    routingExcluded: false,
    executionSuccess: true,
    failureCode: null,
    infrastructureReason: null,
  };
}

it("creates a result directory and refuses a second create without resume", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-results-"));
  const opened = openResultDirectory(request(root));
  expect(opened.directory).toContain("mock_n5_k1_abc1234");
  const summary = JSON.parse(readFileSync(join(opened.directory, "summary.json"), "utf8")) as {
    execution_success_rate: number | null;
    attempts: number;
  };
  expect(summary).toMatchObject({ attempts: 0, execution_success_rate: null });
  expect(() => openResultDirectory(request(root))).toThrow(/overwrite/);
});

it("skips completed task repetitions on resume, using runs.jsonl if the checkpoint is behind", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-results-"));
  const opened = openResultDirectory(request(root));
  opened.append(run("task_0001"));
  writeFileSync(join(opened.directory, "checkpoint.json"), `${JSON.stringify({ completed: [] })}\n`);
  const resumed = openResultDirectory(request(root, { resume: true }));
  expect(resumed.completedKey("task_0001", 0)).toBe(true);
  expect(resumed.completedKey("task_0002", 0)).toBe(false);
});

it("refuses to resume when the config hash differs", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-results-"));
  openResultDirectory(request(root));
  expect(() => openResultDirectory(request(root, { resume: true, configHash: "hash-b" }))).toThrow(/hash mismatch/);
});

it("reports execution success rate from scored runs only", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-results-"));
  const opened = openResultDirectory(request(root));
  opened.append(run("task_0001"));
  opened.append({
    ...run("task_0002"),
    executionExcluded: true,
    routingExcluded: true,
    executionSuccess: false,
    failureCode: "R0",
    infrastructureReason: "provider_error",
  });
  const summary = JSON.parse(readFileSync(join(opened.directory, "summary.json"), "utf8")) as {
    attempts: number;
    r0_attempts: number;
    routing_scored: number;
    execution_scored: number;
    execution_success_rate: number;
  };
  expect(summary).toEqual({
    attempts: 2,
    r0_attempts: 1,
    routing_scored: 1,
    execution_scored: 1,
    execution_success_rate: 1,
  });
});
