import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadExperimentConfig } from "./load.js";
import { parseExperimentConfig } from "./schema.js";
import {
  K_SWEEP_TOOLSPACE_SIZE,
  K_SWEEP_TOP_KS,
  buildKSweepConfig,
  enumerateKSweepCells,
  renderKSweepYaml,
} from "./k-sweep.js";
import { MATRIX_DATASET_PATH } from "./matrix.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function withoutTopK(config: ReturnType<typeof buildKSweepConfig>) {
  const { topK: _omit, ...rest } = config;
  void _omit;
  return rest;
}

describe("Jev k-sweep configs", () => {
  it("enumerates k ∈ {1, 3, 5, 10} at the fixed M4 N", () => {
    const cells = enumerateKSweepCells();
    expect(cells.map((cell) => cell.topK)).toEqual([...K_SWEEP_TOP_KS]);
    expect(cells.map((cell) => cell.relativePath)).toEqual([
      "configs/k-sweep/jev-top1-n25.yaml",
      "configs/k-sweep/jev-top3-n25.yaml",
      "configs/k-sweep/jev-top5-n25.yaml",
      "configs/k-sweep/jev-top10-n25.yaml",
    ]);
    for (const cell of cells) {
      expect(cell.config.toolspaceSize).toBe(K_SWEEP_TOOLSPACE_SIZE);
      expect(cell.config.toolspaceSize).toBeGreaterThanOrEqual(cell.topK);
    }
  });

  it("varies only topK across the sweep; all other scientific controls match", () => {
    const cells = enumerateKSweepCells();
    const baseline = withoutTopK(cells[0]!.config);
    for (const cell of cells) {
      expect(withoutTopK(cell.config)).toEqual(baseline);
      expect(cell.config.architecture).toBe("jev");
      expect(cell.config.datasetPath).toBe(MATRIX_DATASET_PATH);
      expect(cell.config.agent).toEqual({
        provider: "openai",
        model: "gpt-5.6-sol",
        temperature: 0,
      });
      expect(cell.config.router).toEqual({ provider: "typesafe", model: "jev-1.13.0" });
      expect(cell.config.pricingVersion).toBe("v1");
      expect(cell.config.seed).toBe(0);
      expect(cell.config.repetitions).toBe(1);
      expect(cell.config.concurrency).toBe(1);
      expect(cell.config.tracing).toBe("noop");
      expect(cell.config.routerOnly).toBe(false);
    }
  });

  it("loads every checked-in k-sweep config and matches the generator render", () => {
    for (const cell of enumerateKSweepCells()) {
      const loaded = loadExperimentConfig(join(repoRoot, cell.relativePath));
      expect(loaded.config).toEqual(cell.config);
      expect(loaded.config.topK).toBe(cell.topK);
      expect(readFileSync(join(repoRoot, cell.relativePath), "utf8")).toBe(renderKSweepYaml(cell.config));
    }
  });

  it("does not leave stray files in configs/k-sweep", () => {
    const expected = new Set(enumerateKSweepCells().map((cell) => cell.relativePath.split("/").pop()!));
    const actual = readdirSync(join(repoRoot, "configs/k-sweep")).filter((name) => name.endsWith(".yaml"));
    expect(new Set(actual)).toEqual(expected);
  });

  it("rejects an unpinned Jev alias in a k-sweep-shaped config", () => {
    expect(() =>
      parseExperimentConfig({
        ...buildKSweepConfig(5),
        router: { provider: "typesafe", model: "jev-latest" },
      }),
    ).toThrow(/pinned/);
  });
});
