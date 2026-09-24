import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ManifestScopeError,
  loadCompletedCellsFromManifest,
  refuseResultsRootScan,
} from "./manifest-scope.js";

function writeCell(root: string, name: string, topK: number): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "config.json"),
    `${JSON.stringify(
      {
        architecture: "jev",
        toolspaceSize: 100,
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
        tracing: "noop",
        routerOnly: false,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(directory, "runs.jsonl"),
    `${JSON.stringify({
      taskId: "task_0001",
      repetition: 0,
      routingExcluded: false,
      executionExcluded: false,
      executionSuccess: true,
      failureCode: null,
      recallAtK: 1,
      lenientRecallAtK: 1,
      confidence: 0.9,
      selectionAccuracy: 1,
      candidates: ["gold"],
      routerUsage: { inputTokens: 1, outputTokens: 0 },
      agentUsage: { inputTokens: 2, outputTokens: 0 },
      pricedCostUsd: 0.01,
      providerReportedCostUsd: null,
      routerLatencyMs: 1,
      agentLatencyMs: 2,
      totalLatencyMs: 3,
    })}\n`,
  );
  return directory;
}

describe("loadCompletedCellsFromManifest", () => {
  it("loads only directories listed in the manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-manifest-scope-"));
    const d1 = writeCell(root, "epoch_k1", 1);
    writeCell(root, "epoch_k1_other", 1); // must be ignored
    const d3 = writeCell(root, "epoch_k3", 3);
    const manifestPath = join(root, "_k-sweep", "ts.json");
    mkdirSync(join(root, "_k-sweep"), { recursive: true });
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          version: 1,
          timestamp: "ts",
          mock: true,
          cells: [
            {
              relativePath: "configs/k-sweep/jev-top1-n100.yaml",
              status: "completed",
              directory: d1,
              error: null,
            },
            {
              relativePath: "configs/k-sweep/jev-top3-n100.yaml",
              status: "completed",
              directory: d3,
              error: null,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const loaded = loadCompletedCellsFromManifest(manifestPath);
    expect(loaded.timestamp).toBe("ts");
    expect(loaded.directories.map((d) => d.directory).sort()).toEqual([d1, d3].sort());
    expect(loaded.directories).toHaveLength(2);
  });

  it("fails when a cell is not completed", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-manifest-fail-"));
    const d1 = writeCell(root, "epoch_k1", 1);
    const manifestPath = join(root, "m.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({
        version: 1,
        timestamp: "ts",
        cells: [
          {
            relativePath: "a.yaml",
            status: "failed",
            directory: d1,
            error: "x",
          },
        ],
      })}\n`,
    );
    expect(() => loadCompletedCellsFromManifest(manifestPath)).toThrow(ManifestScopeError);
    expect(() => loadCompletedCellsFromManifest(manifestPath)).toThrow(/status=failed/);
  });
});

describe("refuseResultsRootScan", () => {
  it("throws a fail-closed message naming --manifest", () => {
    expect(() => refuseResultsRootScan("summarize")).toThrow(ManifestScopeError);
    expect(() => refuseResultsRootScan("summarize")).toThrow(/--manifest/);
    expect(() => refuseResultsRootScan("summarize")).toThrow(/M3 and M4/);
  });
});
