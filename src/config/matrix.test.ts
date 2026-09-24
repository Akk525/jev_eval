import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadExperimentConfig } from "./load.js";
import {
  MATRIX_ARCHITECTURES,
  MATRIX_DATASET_PATH,
  MATRIX_TOP_K,
  buildMatrixConfig,
  enumerateMatrixCells,
  matrixRelativePath,
  renderMatrixYaml,
} from "./matrix.js";
import { parseExperimentConfig } from "./schema.js";
import { SCALING_TOOLSPACE_SIZES } from "../tools/toolspace.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("N-matrix configs", () => {
  it("enumerates the full 3 × 5 matrix before execution", () => {
    const cells = enumerateMatrixCells();
    expect(cells).toHaveLength(MATRIX_ARCHITECTURES.length * SCALING_TOOLSPACE_SIZES.length);
    expect(cells.map((c) => c.relativePath)).toEqual([
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
      if (cell.architecture === "baseline") {
        expect(loaded.config.topK).toBeNull();
        expect(loaded.config.router).toBeNull();
      } else {
        expect(loaded.config.topK).toBe(MATRIX_TOP_K);
        expect(loaded.config.router?.model).not.toMatch(/latest/);
      }
      if (cell.architecture === "jev") {
        expect(loaded.config.router).toEqual({ provider: "typesafe", model: "jev-1.13.0" });
      }
      if (cell.architecture === "llm") {
        expect(loaded.config.router).toEqual({ provider: "openai", model: "gpt-5.6-sol" });
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
    const base = buildMatrixConfig("jev", 25);
    expect(() =>
      parseExperimentConfig({
        ...base,
        router: { provider: "typesafe", model: "jev-latest" },
      }),
    ).toThrow(/pinned/);
  });

  it("builds relative paths without hard-coding N in the runner", () => {
    expect(matrixRelativePath("baseline", 50)).toBe("configs/matrix/baseline-n50.yaml");
    expect(matrixRelativePath("llm", 5)).toBe("configs/matrix/llm-top5-n5.yaml");
  });
});
