import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadDataset } from "../../src/dataset/schema.js";
import { runMockedSlice } from "../../src/eval/runner/slice.js";
import { createMemoraTracer } from "../../src/tracing/memora/adapter.js";
import { NoopTracer } from "../../src/tracing/tracer.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const tasksPath = join(repoRoot, "datasets/v0.1/tasks.jsonl");

function handful() {
  return loadDataset(tasksPath).slice(0, 5);
}

it("writes a mocked baseline result directory with registry hash and dataset version", async () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-baseline-"));
  const directory = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot,
    tasks: handful(),
    timestamp: "2026-09-23T180000Z",
  });
  const config = JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as {
    architecture: string;
    registryHash: string;
    datasetVersion: string;
    pricingVersion: string;
  };
  const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8")) as {
    attempts: number;
    execution_success_rate: number | null;
    r0_attempts: number;
  };
  expect(config.architecture).toBe("baseline");
  expect(config.registryHash).toMatch(/^[a-f0-9]{64}$/);
  expect(config.datasetVersion).toBe("1");
  expect(config.pricingVersion).toBe("v1");
  expect(summary.attempts).toBe(5);
  expect(summary.r0_attempts).toBe(0);
  expect(summary.execution_success_rate).toBe(1);
});

it("writes a mocked Jev result directory with independent probability fields", async () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-top5-"));
  const directory = await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
    resultsRoot,
    tasks: handful(),
    timestamp: "2026-09-23T180100Z",
  });
  const config = JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as {
    architecture: string;
    registryHash: string;
    datasetVersion: string;
  };
  const runs = readFileSync(join(directory, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          toolspace: string[];
          scores: Record<string, number> | null;
          top1Probability: number | null;
          confidence: number | null;
        },
    );
  expect(config.architecture).toBe("jev");
  expect(config.registryHash).toMatch(/^[a-f0-9]{64}$/);
  expect(config.datasetVersion).toBe("1");
  expect(runs).toHaveLength(5);
  for (const run of runs) {
    expect(run.toolspace).toHaveLength(20);
    expect(run.scores).not.toBeNull();
    expect(run.top1Probability).not.toBeNull();
    expect(run.confidence).not.toBeNull();
    expect(run.confidence).not.toBe(run.top1Probability);
  }
});

it("records nested toolspaces and excludes router R0 from execution success", async () => {
  const tasks = handful().slice(0, 1);
  const smallRoot = mkdtempSync(join(tmpdir(), "jev-n5-"));
  const largeRoot = mkdtempSync(join(tmpdir(), "jev-n10-"));
  const smallDir = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot: smallRoot,
    tasks,
    timestamp: "2026-09-23T180200Z",
    toolspaceSize: 5,
  });
  const largeDir = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot: largeRoot,
    tasks,
    timestamp: "2026-09-23T180300Z",
    toolspaceSize: 10,
  });
  const small = JSON.parse(readFileSync(join(smallDir, "runs.jsonl"), "utf8")) as { toolspace: string[] };
  const large = JSON.parse(readFileSync(join(largeDir, "runs.jsonl"), "utf8")) as { toolspace: string[] };
  expect(large.toolspace.slice(0, small.toolspace.length)).toEqual(small.toolspace);

  const r0Root = mkdtempSync(join(tmpdir(), "jev-r0-"));
  const r0Dir = await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
    resultsRoot: r0Root,
    tasks,
    timestamp: "2026-09-23T180400Z",
    failRouter: true,
  });
  const summary = JSON.parse(readFileSync(join(r0Dir, "summary.json"), "utf8")) as {
    attempts: number;
    r0_attempts: number;
    execution_scored: number;
    execution_success_rate: number | null;
  };
  expect(summary).toMatchObject({
    attempts: 1,
    r0_attempts: 1,
    execution_scored: 0,
    execution_success_rate: null,
  });
});

it("resumes without rewriting completed tasks and survives a Memora failure", async () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-resume-"));
  const tasks = handful().slice(0, 2);
  const first = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot,
    tasks: [tasks[0]!],
    timestamp: "2026-09-23T180500Z",
  });
  expect(readFileSync(join(first, "runs.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);

  const warnings: string[] = [];
  const resumed = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot,
    tasks,
    timestamp: "2026-09-23T180500Z",
    resume: true,
    tracer: createMemoraTracer({
      client: {
        async recordEvent() {
          throw new Error("memora down");
        },
      },
      onError(error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      },
    }),
  });
  const runs = readFileSync(join(resumed, "runs.jsonl"), "utf8").trim().split("\n");
  expect(runs).toHaveLength(2);
  expect(warnings.length).toBeGreaterThan(0);
  const summary = JSON.parse(readFileSync(join(resumed, "summary.json"), "utf8")) as {
    execution_success_rate: number | null;
    r0_attempts: number;
  };
  expect(summary.r0_attempts).toBe(0);
  expect(summary.execution_success_rate).toBe(1);
});

it("keeps noop tracing available beside Memora", async () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-noop-"));
  const directory = await runMockedSlice({
    configPath: join(repoRoot, "configs/baseline-20.yaml"),
    resultsRoot,
    tasks: handful().slice(0, 1),
    timestamp: "2026-09-23T180600Z",
    tracer: new NoopTracer(),
  });
  expect(readFileSync(join(directory, "runs.jsonl"), "utf8").trim()).not.toBe("");
});
