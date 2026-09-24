import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_EVAL_HOLDOUT_SPLIT,
  ADAPTIVE_EVAL_TOOLSPACE_SIZE,
  buildAdaptiveEvalConfig,
  enumerateAdaptiveEvalCells,
} from "./adaptive-eval.js";
import { parseExperimentConfig } from "./schema.js";
import { isDevelopmentTask } from "../analysis/adaptive-threshold-select.js";

describe("enumerateAdaptiveEvalCells", () => {
  it("lists baseline, jev top-1, jev top-5, and adaptive at fixed N", () => {
    const cells = enumerateAdaptiveEvalCells();
    expect(cells.map((cell) => cell.id)).toEqual(["baseline", "jev_top1", "jev_top5", "adaptive"]);
    expect(cells.every((cell) => cell.toolspaceSize === ADAPTIVE_EVAL_TOOLSPACE_SIZE)).toBe(true);
    expect(cells[1]?.config.topK).toBe(1);
    expect(cells[2]?.config.topK).toBe(5);
    expect(cells[3]?.config.architecture).toBe("adaptive");
    expect(cells[3]?.config.adaptivePolicyPath).toBe("policies/adaptive/v1.json");
  });

  it("parses every generated config", () => {
    for (const cell of enumerateAdaptiveEvalCells()) {
      expect(() => parseExperimentConfig(cell.config)).not.toThrow();
      expect(parseExperimentConfig(buildAdaptiveEvalConfig(cell.id)).architecture).toBe(
        cell.config.architecture,
      );
    }
  });

  it("documents holdout as the complement of the #42 development split", () => {
    expect(ADAPTIVE_EVAL_HOLDOUT_SPLIT.rule).toMatch(/odd/);
    expect(isDevelopmentTask("task_0001")).toBe(true); // even hash → development in #42
    expect(isDevelopmentTask("task_0002")).toBe(false); // odd hash → holdout for #44
  });
});
