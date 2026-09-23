import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadDataset } from "../../src/dataset/schema.js";
import { runMockedSlice } from "../../src/eval/runner/slice.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const tasksPath = join(repoRoot, "datasets/v0.1/tasks.jsonl");

function handful() {
  return loadDataset(tasksPath).slice(0, 5);
}

it("records Recall@k on a mocked router-only run without calling the agent", async () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-router-only-"));
  const directory = await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-router-only-20.yaml"),
    resultsRoot,
    tasks: handful(),
    timestamp: "2026-09-23T181000Z",
  });
  const config = JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as {
    architecture: string;
    routerOnly: boolean;
    registryHash: string;
    datasetVersion: string;
  };
  const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8")) as {
    attempts: number;
    routing_scored: number;
    execution_scored: number;
    execution_success_rate: number | null;
    agent_input_tokens: number;
  };
  const runs = readFileSync(join(directory, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          candidates: string[] | null;
          recallAtK: number | null;
          selectionAccuracy: number | null;
          executionExcluded: boolean;
          agentUsage: { inputTokens: number; outputTokens: number };
        },
    );

  expect(config.architecture).toBe("jev");
  expect(config.routerOnly).toBe(true);
  expect(config.registryHash).toMatch(/^[a-f0-9]{64}$/);
  expect(config.datasetVersion).toBe("1");
  expect(summary.attempts).toBe(5);
  expect(summary.routing_scored).toBe(5);
  expect(summary.execution_scored).toBe(0);
  expect(summary.execution_success_rate).toBeNull();
  expect(summary.agent_input_tokens).toBe(0);
  expect(runs).toHaveLength(5);
  for (const run of runs) {
    expect(run.candidates).not.toBeNull();
    expect(run.candidates).toHaveLength(5);
    expect(run.recallAtK).toBe(1);
    expect(run.selectionAccuracy).toBeNull();
    expect(run.executionExcluded).toBe(true);
    expect(run.agentUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
  }
});
