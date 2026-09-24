import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadExperimentConfig } from "./load.js";
import {
  MATRIX_CELL_IDS,
  MATRIX_DATASET_PATH,
  MATRIX_TOP_K,
  MATRIX_TOP_K_CONTROL,
  buildMatrixConfig,
  enumerateMatrixCells,
  matrixRelativePath,
  renderMatrixYaml,
} from "./matrix.js";
import { parseExperimentConfig } from "./schema.js";
import { SCALING_TOOLSPACE_SIZES } from "../tools/toolspace.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("N-matrix configs", () => {
  it("enumerates the full 3 × 5 M3 matrix (baseline / jev_top1 / jev_top5)", () => {
    const cells = enumerateMatrixCells();
    expect(cells).toHaveLength(MATRIX_CELL_IDS.length * SCALING_TOOLSPACE_SIZES.length);
    expect(cells.map((c) => c.relativePath)).toEqual([
      "configs/matrix/baseline-n5.yaml",
      "configs/matrix/baseline-n10.yaml",
      "configs/matrix/baseline-n25.yaml",
      "configs/matrix/baseline-n50.yaml",
      "configs/matrix/baseline-n100.yaml",
      "configs/matrix/jev-top1-n5.yaml",
      "configs/matrix/jev-top1-n10.yaml",
      "configs/matrix/jev-top1-n25.yaml",
      "configs/matrix/jev-top1-n50.yaml",
      "configs/matrix/jev-top1-n100.yaml",
      "configs/matrix/jev-top5-n5.yaml",
      "configs/matrix/jev-top5-n10.yaml",
      "configs/matrix/jev-top5-n25.yaml",
      "configs/matrix/jev-top5-n50.yaml",
      "configs/matrix/jev-top5-n100.yaml",
    ]);
  });

  it("loads every checked-in matrix config with D10/D11 pins and v0.2", () => {
    const cells = enumerateMatrixCells();
    for (const cell of cells) {
      const loaded = loadExperimentConfig(join(repoRoot, cell.relativePath));
      expect(loaded.config).toEqual(cell.config);
      expect(loaded.config.datasetPath).toBe(MATRIX_DATASET_PATH);
      expect(loaded.config.agent).toEqual({
        provider: "openai",
        model: "gpt-5.6-sol",
        temperature: 0,
      });
      expect(loaded.config.agent.model).not.toMatch(/latest/);
      if (cell.id === "baseline") {
        expect(loaded.config.topK).toBeNull();
        expect(loaded.config.router).toBeNull();
      } else if (cell.id === "jev_top1") {
        expect(loaded.config.topK).toBe(MATRIX_TOP_K_CONTROL);
        expect(loaded.config.router).toEqual({ provider: "typesafe", model: "jev-1.13.0" });
      } else {
        expect(loaded.config.topK).toBe(MATRIX_TOP_K);
        expect(loaded.config.router).toEqual({ provider: "typesafe", model: "jev-1.13.0" });
      }
    }
  });

  it("keeps checked-in YAML identical to the generator render", () => {
    for (const cell of enumerateMatrixCells()) {
      const onDisk = readFileSync(join(repoRoot, cell.relativePath), "utf8");
      expect(onDisk).toBe(renderMatrixYaml(cell.config));
    }
  });

  it("does not leave stray files in configs/matrix", () => {
    const expected = new Set(enumerateMatrixCells().map((c) => c.relativePath.split("/").pop()!));
    const actual = readdirSync(join(repoRoot, "configs/matrix")).filter((name) => name.endsWith(".yaml"));
    expect(new Set(actual)).toEqual(expected);
  });

  it("rejects an unpinned alias in a matrix-shaped config", () => {
    const base = buildMatrixConfig("jev_top5", 25);
    expect(() =>
      parseExperimentConfig({
        ...base,
        router: { provider: "typesafe", model: "jev-latest" },
      }),
    ).toThrow(/pinned/);
  });

  it("builds relative paths without hard-coding N in the runner", () => {
    expect(matrixRelativePath("baseline", 50)).toBe("configs/matrix/baseline-n50.yaml");
    expect(matrixRelativePath("jev_top1", 5)).toBe("configs/matrix/jev-top1-n5.yaml");
    expect(matrixRelativePath("jev_top5", 100)).toBe("configs/matrix/jev-top5-n100.yaml");
  });

  it("differs across architectures only by routing/tool-exposure treatment", () => {
    const n25 = SCALING_TOOLSPACE_SIZES[2]!;
    const baseline = buildMatrixConfig("baseline", n25);
    const top1 = buildMatrixConfig("jev_top1", n25);
    const top5 = buildMatrixConfig("jev_top5", n25);
    for (const cfg of [baseline, top1, top5]) {
      expect(cfg.datasetPath).toBe(MATRIX_DATASET_PATH);
      expect(cfg.repetitions).toBe(1);
      expect(cfg.concurrency).toBe(1);
      expect(cfg.seed).toBe(0);
      expect(cfg.agent).toEqual(baseline.agent);
      expect(cfg.pricingVersion).toBe("v1");
      expect(cfg.tracing).toBe("noop");
      expect(cfg.toolspaceSize).toBe(25);
    }
    expect(baseline.router).toBeNull();
    expect(baseline.topK).toBeNull();
    expect(top1.topK).toBe(1);
    expect(top5.topK).toBe(5);
    expect(top1.router).toEqual(top5.router);
  });
});
