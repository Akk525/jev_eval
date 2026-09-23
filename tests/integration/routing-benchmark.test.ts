import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadDataset } from "../../src/dataset/schema.js";
import {
  createPreferredDecisionProvider,
  createPreferredRankProvider,
  runMockedSlice,
} from "../../src/eval/runner/slice.js";
import type { DecisionRequest } from "../../src/providers/types.js";
import { createJevRouter } from "../../src/routers/jev/jev.js";
import { createLlmRouter, type RankRequest } from "../../src/routers/llm/llm.js";
import { createCatalogRegistry } from "../../src/tools/catalog.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const tasksPath = join(repoRoot, "datasets/v0.1/tasks.jsonl");

function handful() {
  return loadDataset(tasksPath).slice(0, 5);
}

function preferredMap(tasks: ReturnType<typeof handful>): Map<string, string> {
  const preferred = new Map<string, string>();
  for (const task of tasks) {
    const tool = task.required_tools[0];
    if (tool !== undefined) preferred.set(task.prompt, tool);
  }
  return preferred;
}

it("writes mocked Jev and LLM result directories with matching nested toolspaces", async () => {
  const tasks = handful();
  const jevDir = await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-jev-")),
    tasks,
    timestamp: "2026-09-23T190000Z",
  });
  const llmDir = await runMockedSlice({
    configPath: join(repoRoot, "configs/llm-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-llm-")),
    tasks,
    timestamp: "2026-09-23T190100Z",
  });

  const jevConfig = JSON.parse(readFileSync(join(jevDir, "config.json"), "utf8")) as {
    architecture: string;
    registryHash: string;
    datasetVersion: string;
  };
  const llmConfig = JSON.parse(readFileSync(join(llmDir, "config.json"), "utf8")) as {
    architecture: string;
    registryHash: string;
    datasetVersion: string;
  };
  expect(jevConfig.architecture).toBe("jev");
  expect(llmConfig.architecture).toBe("llm");
  expect(jevConfig.registryHash).toBe(llmConfig.registryHash);
  expect(jevConfig.registryHash).toMatch(/^[a-f0-9]{64}$/);
  expect(jevConfig.datasetVersion).toBe("1");
  expect(llmConfig.datasetVersion).toBe("1");

  const jevRuns = readRuns(jevDir);
  const llmRuns = readRuns(llmDir);
  expect(jevRuns).toHaveLength(5);
  expect(llmRuns).toHaveLength(5);
  for (let index = 0; index < jevRuns.length; index += 1) {
    expect(llmRuns[index]?.toolspace).toEqual(jevRuns[index]?.toolspace);
    expect(jevRuns[index]?.toolspace).toHaveLength(20);
    expect(llmRuns[index]?.candidates).toHaveLength(5);
    expect(jevRuns[index]?.candidates).toHaveLength(5);
    expect(jevRuns[index]?.scores).not.toBeNull();
    expect(llmRuns[index]?.scores).toBeNull();
    expect(llmRuns[index]?.confidence).toBeNull();
  }

  const nestedTask = tasks.slice(0, 1);
  const smallJev = await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-n5-")),
    tasks: nestedTask,
    timestamp: "2026-09-23T190200Z",
    toolspaceSize: 5,
  });
  const largeLlm = await runMockedSlice({
    configPath: join(repoRoot, "configs/llm-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-n10-")),
    tasks: nestedTask,
    timestamp: "2026-09-23T190300Z",
    toolspaceSize: 10,
  });
  const small = readRuns(smallJev)[0]!;
  const large = readRuns(largeLlm)[0]!;
  expect(large.toolspace.slice(0, small.toolspace.length)).toEqual(small.toolspace);
});

it("excludes R0 for both mocked Jev and LLM routers", async () => {
  const tasks = handful().slice(0, 1);
  for (const [configName, stamp] of [
    ["configs/jev-top5-20.yaml", "2026-09-23T190400Z"],
    ["configs/llm-top5-20.yaml", "2026-09-23T190500Z"],
  ] as const) {
    const directory = await runMockedSlice({
      configPath: join(repoRoot, configName),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-r0-")),
      tasks,
      timestamp: stamp,
      failRouter: true,
    });
    const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8")) as {
      r0_attempts: number;
      routing_scored: number;
      execution_success_rate: number | null;
      recall_at_k: number | null;
    };
    expect(summary).toMatchObject({
      r0_attempts: 1,
      routing_scored: 0,
      execution_success_rate: null,
      recall_at_k: null,
    });
  }
});

it("passes only routingSummary text to both mocked routers", async () => {
  const tasks = handful().slice(0, 2);
  const preferred = preferredMap(tasks);
  const registry = createCatalogRegistry();
  const byName = new Map(registry.list().map((tool) => [tool.name, tool]));
  const jevCriteria: DecisionRequest["criteria"][] = [];
  const llmPrompts: string[] = [];

  const jevInner = createPreferredDecisionProvider(preferred);
  const llmInner = createPreferredRankProvider(preferred);

  await runMockedSlice({
    configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-sum-jev-")),
    tasks,
    timestamp: "2026-09-23T190600Z",
    router: createJevRouter({
      async decide(request) {
        jevCriteria.push(request.criteria);
        return jevInner.decide(request);
      },
    }),
  });
  await runMockedSlice({
    configPath: join(repoRoot, "configs/llm-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-m2-sum-llm-")),
    tasks,
    timestamp: "2026-09-23T190700Z",
    router: createLlmRouter({
      async rank(request: RankRequest) {
        llmPrompts.push(request.prompt);
        return llmInner.rank(request);
      },
    }),
  });

  expect(jevCriteria.length).toBe(2);
  expect(llmPrompts.length).toBe(2);

  for (const criteria of jevCriteria) {
    for (const [name, text] of Object.entries(criteria)) {
      const tool = byName.get(name);
      expect(tool).toBeDefined();
      expect(text).toBe(tool!.routingSummary);
      expect(text).not.toContain('"type"');
      expect(JSON.stringify(criteria)).not.toContain("properties");
    }
  }

  for (const prompt of llmPrompts) {
    expect(prompt).not.toMatch(/parameters|"type"\s*:\s*"object"|properties/i);
    const toolsBlock = prompt.split("\n\nTools:\n")[1] ?? "";
    for (const line of toolsBlock.split("\n").filter((entry) => entry.includes(":"))) {
      const name = line.slice(0, line.indexOf(":")).trim();
      const summary = line.slice(line.indexOf(":") + 1).trim();
      expect(byName.get(name)?.routingSummary).toBe(summary);
    }
  }
});

function readRuns(directory: string) {
  return readFileSync(join(directory, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          toolspace: string[];
          candidates: string[] | null;
          scores: Record<string, number> | null;
          confidence: number | null;
        },
    );
}
