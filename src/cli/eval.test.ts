import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadExperimentConfig } from "../config/load.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function cli(args: string[]) {
  return spawnSync("node_modules/.bin/tsx", ["src/cli/eval.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

it("shows the config path in help", () => {
  const run = cli(["--help"]);
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout).toContain("--config <file>");
});

it("validates the baseline, Jev, LLM, adaptive, and router-only example configs without calling a provider", () => {
  const baseline = cli(["--validate", "--config", "configs/baseline-20.yaml"]);
  const jev = cli(["--validate", "--config", "configs/jev-top5-20.yaml"]);
  const llm = cli(["--validate", "--config", "configs/llm-top5-20.yaml"]);
  const adaptive = cli(["--validate", "--config", "configs/adaptive-top5-20.yaml"]);
  const routerOnly = cli(["--validate", "--config", "configs/jev-router-only-20.yaml"]);
  expect(baseline.status, baseline.stderr).toBe(0);
  expect(jev.status, jev.stderr).toBe(0);
  expect(llm.status, llm.stderr).toBe(0);
  expect(adaptive.status, adaptive.stderr).toBe(0);
  expect(routerOnly.status, routerOnly.stderr).toBe(0);
  expect(baseline.stdout).toContain("agent=openai/gpt-5.6-sol");
  expect(baseline.stdout).toContain("router=none");
  expect(baseline.stdout).toContain("mode=full");
  expect(jev.stdout).toContain("agent=openai/gpt-5.6-sol");
  expect(jev.stdout).toContain("router=typesafe/jev-1.13.0");
  expect(jev.stdout).not.toContain("jev-latest");
  expect(llm.stdout).toContain("agent=openai/gpt-5.6-sol");
  expect(llm.stdout).toContain("router=openai/gpt-5.6-sol");
  expect(adaptive.stdout).toContain("router=typesafe/jev-1.13.0");
  expect(routerOnly.stdout).toContain("mode=router-only");
  expect(routerOnly.stdout).toContain("router=typesafe/jev-1.13.0");
}, 20_000);

it("validates every N-matrix config without calling a provider", () => {
  const paths = [
    "configs/matrix/baseline-n5.yaml",
    "configs/matrix/baseline-n10.yaml",
    "configs/matrix/baseline-n25.yaml",
    "configs/matrix/baseline-n50.yaml",
    "configs/matrix/baseline-n100.yaml",
    "configs/matrix/jev-top5-n5.yaml",
    "configs/matrix/jev-top5-n10.yaml",
    "configs/matrix/jev-top5-n25.yaml",
    "configs/matrix/jev-top5-n50.yaml",
    "configs/matrix/jev-top5-n100.yaml",
    "configs/matrix/llm-top5-n5.yaml",
    "configs/matrix/llm-top5-n10.yaml",
    "configs/matrix/llm-top5-n25.yaml",
    "configs/matrix/llm-top5-n50.yaml",
    "configs/matrix/llm-top5-n100.yaml",
  ];
  for (const configPath of paths) {
    const run = cli(["--validate", "--config", configPath]);
    expect(run.status, `${configPath}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("agent=openai/gpt-5.6-sol");
    expect(run.stdout).not.toContain("jev-latest");
  }
}, 30_000);

it("validates final end-to-end configs with repetitions=3", () => {
  for (const name of ["baseline-20.yaml", "jev-top5-20.yaml", "llm-top5-20.yaml"]) {
    const configPath = `configs/final/${name}`;
    const run = cli(["--validate", "--config", configPath]);
    expect(run.status, `${configPath}\n${run.stderr}`).toBe(0);
    expect(loadExperimentConfig(join(repoRoot, configPath)).config.repetitions).toBe(3);
  }
});

it("validates every Jev k-sweep config and keeps only topK different", () => {
  const paths = [
    "configs/k-sweep/jev-top1-n25.yaml",
    "configs/k-sweep/jev-top3-n25.yaml",
    "configs/k-sweep/jev-top5-n25.yaml",
    "configs/k-sweep/jev-top10-n25.yaml",
  ];
  const loaded = paths.map((configPath) => {
    const run = cli(["--validate", "--config", configPath]);
    expect(run.status, `${configPath}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("router=typesafe/jev-1.13.0");
    return loadExperimentConfig(join(repoRoot, configPath)).config;
  });
  expect(loaded.map((config) => config.topK)).toEqual([1, 3, 5, 10]);
  const controls = loaded.map((config) => {
    const { topK: _omit, ...rest } = config;
    void _omit;
    return rest;
  });
  expect(controls.every((config) => JSON.stringify(config) === JSON.stringify(controls[0]))).toBe(true);
}, 20_000);

it("exits non-zero on a dry validation failure", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-config-"));
  const configPath = join(root, "bad.yaml");
  writeFileSync(
    configPath,
    [
      "architecture: jev",
      "toolspaceSize: 20",
      "topK: 5",
      "datasetPath: datasets/v0.1/tasks.jsonl",
      "repetitions: 1",
      "concurrency: 1",
      "seed: 0",
      "agent:",
      "  provider: openai",
      "  model: gpt-5.6-sol",
      "  temperature: 0",
      "router:",
      "  provider: typesafe",
      "  model: jev-latest",
      "pricingVersion: v1",
      "tracing: noop",
      "",
    ].join("\n"),
  );
  const run = cli(["--validate", "--config", configPath]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("pinned");
});
