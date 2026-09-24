import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DRESS_REHEARSAL_TASK_COUNT,
  DRESS_REHEARSAL_TOOLSPACE_SIZES,
  buildDressRehearsalConfig,
  enumerateDressRehearsalCells,
  renderDressRehearsalYaml,
} from "./dress-rehearsal.js";
import { loadExperimentConfig } from "./load.js";

describe("dress-rehearsal config", () => {
  it("enumerates 9 cells: 3 arches × N∈{5,20,50}", () => {
    const cells = enumerateDressRehearsalCells();
    expect(cells).toHaveLength(9);
    expect(cells.map((c) => c.id)).toEqual([
      "baseline",
      "baseline",
      "baseline",
      "jev_top1",
      "jev_top1",
      "jev_top1",
      "jev_top5",
      "jev_top5",
      "jev_top5",
    ]);
    expect(cells.map((c) => c.toolspaceSize)).toEqual([5, 20, 50, 5, 20, 50, 5, 20, 50]);
  });

  it("sets top-1 / top-5 / baseline k correctly", () => {
    expect(buildDressRehearsalConfig("baseline", 20).topK).toBeNull();
    expect(buildDressRehearsalConfig("jev_top1", 20).topK).toBe(1);
    expect(buildDressRehearsalConfig("jev_top5", 50).topK).toBe(5);
  });

  it("keeps checked-in YAMLs in sync with the generator", () => {
    for (const cell of enumerateDressRehearsalCells()) {
      const onDisk = readFileSync(resolve(cell.relativePath), "utf8");
      expect(onDisk).toBe(renderDressRehearsalYaml(cell.config));
      const loaded = loadExperimentConfig(resolve(cell.relativePath));
      expect(loaded.config.toolspaceSize).toBe(cell.toolspaceSize);
      expect(loaded.config.repetitions).toBe(1);
      expect(loaded.config.datasetPath).toBe("datasets/v0.2/tasks.jsonl");
    }
  });

  it("documents frozen sizes and task count", () => {
    expect([...DRESS_REHEARSAL_TOOLSPACE_SIZES]).toEqual([5, 20, 50]);
    expect(DRESS_REHEARSAL_TASK_COUNT).toBe(50);
  });
});
