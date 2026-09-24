import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExperimentConfig } from "../types/config.js";
import { loadExperimentConfig } from "./load.js";
import { parseExperimentConfig } from "./schema.js";

function baseline(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    architecture: "baseline",
    toolspaceSize: 5,
    topK: null,
    datasetPath: "datasets/fixtures/smoke.jsonl",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    agent: { provider: "mock", model: "mock-agent", temperature: 0 },
    router: null,
    pricingVersion: "v1",
    tracing: "noop",
    routerOnly: false,
    ...overrides,
  };
}

describe("parseExperimentConfig", () => {
  it("loads the smoke config and hashes it stably", () => {
    const smokePath = fileURLToPath(new URL("../../configs/smoke.yaml", import.meta.url));
    const first = loadExperimentConfig(smokePath);
    const second = loadExperimentConfig(smokePath);
    expect(first.config.architecture).toBe("mock");
    expect(first.config.toolspaceSize).toBe(5);
    expect(first.hash).toBe(second.hash);
  });

  it("hashes the same config identically when YAML key order changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-config-"));
    const firstPath = join(dir, "a.yaml");
    const secondPath = join(dir, "b.yaml");
    writeFileSync(
      firstPath,
      "architecture: jev\ntoolspaceSize: 7\ntopK: 4\ndatasetPath: tasks.jsonl\nrepetitions: 1\nconcurrency: 1\nseed: 1\nagent:\n  provider: openrouter\n  model: pinned-agent\n  temperature: 0\nrouter:\n  provider: openrouter\n  model: typesafe/jev-1.13\npricingVersion: v1\ntracing: noop\n",
    );
    writeFileSync(
      secondPath,
      "tracing: noop\npricingVersion: v1\nrouter:\n  model: typesafe/jev-1.13\n  provider: openrouter\nagent:\n  temperature: 0\n  model: pinned-agent\n  provider: openrouter\nseed: 1\nconcurrency: 1\nrepetitions: 1\ndatasetPath: tasks.jsonl\ntopK: 4\ntoolspaceSize: 7\narchitecture: jev\n",
    );
    expect(loadExperimentConfig(firstPath).hash).toBe(loadExperimentConfig(secondPath).hash);
    expect(loadExperimentConfig(firstPath).config.toolspaceSize).toBe(7);
    expect(loadExperimentConfig(firstPath).config.topK).toBe(4);
  });

  it("rejects baseline with a top-k", () => {
    expect(() => parseExperimentConfig(baseline({ topK: 3 }))).toThrow(/topK/);
  });

  it("rejects a routed architecture without top-k", () => {
    expect(() =>
      parseExperimentConfig(
        baseline({
          architecture: "llm",
          topK: null,
          router: { provider: "openrouter", model: "pinned-router" },
        }),
      ),
    ).toThrow(/topK/);
  });

  it("rejects k greater than N", () => {
    expect(() =>
      parseExperimentConfig(
        baseline({
          architecture: "jev",
          toolspaceSize: 5,
          topK: 10,
          router: { provider: "openrouter", model: "typesafe/jev-1.13" },
        }),
      ),
    ).toThrow(/topK/);
  });

  it("rejects a non-positive toolspace size", () => {
    expect(() => parseExperimentConfig(baseline({ toolspaceSize: 0 }))).toThrow(/toolspaceSize/);
  });

  it("rejects a non-positive top-k", () => {
    expect(() =>
      parseExperimentConfig(
        baseline({
          architecture: "jev",
          topK: 0,
          router: { provider: "openrouter", model: "typesafe/jev-1.13" },
        }),
      ),
    ).toThrow(/topK/);
  });

  it("rejects an unknown architecture", () => {
    expect(() => parseExperimentConfig({ ...baseline(), architecture: "nope" })).toThrow(/architecture/);
  });

  it("rejects an unpinned Jev model id", () => {
    expect(() =>
      parseExperimentConfig(
        baseline({
          architecture: "jev",
          topK: 1,
          router: { provider: "typesafe", model: "jev-latest" },
        }),
      ),
    ).toThrow(/router\.model/);
    expect(() =>
      parseExperimentConfig(baseline({ agent: { provider: "openrouter", model: "~typesafe/jev-latest", temperature: 0 } })),
    ).toThrow(/agent\.model/);
  });

  it("rejects concurrency above the documented bound", () => {
    expect(() => parseExperimentConfig(baseline({ concurrency: 9 }))).toThrow(/concurrency/);
  });

  it("accepts concurrency within the bound", () => {
    expect(parseExperimentConfig(baseline({ concurrency: 2 })).concurrency).toBe(2);
    expect(parseExperimentConfig(baseline({ concurrency: 8 })).concurrency).toBe(8);
  });

  it("defaults routerOnly to false when omitted", () => {
    const { routerOnly: _omit, ...without } = baseline();
    void _omit;
    expect(parseExperimentConfig(without).routerOnly).toBe(false);
  });
});
