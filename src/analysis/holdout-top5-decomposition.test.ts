import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildHoldoutTop5Decomposition,
  scoreShape,
} from "./holdout-top5-decomposition.js";

function writePair(
  top1Lines: object[],
  top5Lines: object[],
): { top1: string; top5: string } {
  const root = join(tmpdir(), `holdout-decomp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const top1 = join(root, "top1");
  const top5 = join(root, "top5");
  mkdirSync(top1, { recursive: true });
  mkdirSync(top5, { recursive: true });
  writeFileSync(join(top1, "runs.jsonl"), top1Lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(join(top5, "runs.jsonl"), top5Lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { top1, top5 };
}

function run(
  taskId: string,
  overrides: Partial<{
    confidence: number;
    recallAtK: number;
    selectionAccuracy: number | null;
    executionSuccess: boolean;
    failureCode: string | null;
    scores: Record<string, number>;
    executionExcluded: boolean;
  }> = {},
) {
  return {
    taskId,
    confidence: overrides.confidence ?? 1,
    recallAtK: overrides.recallAtK ?? 1,
    selectionAccuracy: overrides.selectionAccuracy === undefined ? 1 : overrides.selectionAccuracy,
    executionExcluded: overrides.executionExcluded ?? false,
    routingExcluded: false,
    executionSuccess: overrides.executionSuccess ?? true,
    failureCode: overrides.failureCode === undefined ? null : overrides.failureCode,
    scores: overrides.scores ?? { gold: 1, d1: 0 },
    candidates: ["gold"],
  };
}

describe("buildHoldoutTop5Decomposition", () => {
  it("computes recall, recovery, failure codes, and conf distributions", () => {
    const { top1, top5 } = writePair(
      [
        run("t1", { confidence: 1, recallAtK: 1, scores: { gold: 1, d1: 0 } }),
        run("t2", {
          confidence: 0.4,
          recallAtK: 0,
          executionSuccess: false,
          failureCode: "R1",
          scores: { d1: 0.5, d2: 0.4, gold: 0.1 },
        }),
        run("t3", {
          confidence: 0.9,
          recallAtK: 0,
          executionSuccess: false,
          failureCode: "R1",
          scores: { d1: 0.95, gold: 0.05 },
        }),
      ],
      [
        run("t1", { confidence: 1, recallAtK: 1, selectionAccuracy: 1 }),
        run("t2", {
          confidence: 0.4,
          recallAtK: 1,
          selectionAccuracy: 1,
          executionSuccess: true,
          failureCode: null,
        }),
        run("t3", {
          confidence: 0.9,
          recallAtK: 1,
          selectionAccuracy: 0,
          executionSuccess: false,
          failureCode: "R2",
        }),
      ],
    );

    const d = buildHoldoutTop5Decomposition(top1, top5);
    expect(d.recall.hits_at_1).toBe(1);
    expect(d.recall.hits_at_5).toBe(3);
    expect(d.recall.recall_at_1).toBeCloseTo(1 / 3);
    expect(d.recall.recall_at_5).toBe(1);
    expect(d.contingency.top1_miss_top5_hit).toBe(2);
    expect(d.recovery.execution_recovered).toBe(1);
    expect(d.recovery.execution_recovery_rate).toBeCloseTo(0.5);
    expect(d.recovery.selection_hits).toBe(1);
    expect(d.top5_failures.by_code).toEqual({ R2: 1 });
    expect(d.top5_failures.r2_selection).toHaveLength(1);
    expect(d.confidence_by_top1_routing.correct.median).toBe(1);
    expect(d.confidence_by_top1_routing.incorrect.values).toEqual([0.4, 0.9]);
  });
});

describe("scoreShape", () => {
  it("reports margin and entropy from score mass", () => {
    const peaked = scoreShape({ a: 0.9, b: 0.05, c: 0.05 });
    const flat = scoreShape({ a: 0.4, b: 0.35, c: 0.25 });
    expect(peaked!.margin).toBeCloseTo(0.85);
    expect(flat!.margin).toBeCloseTo(0.05);
    expect(flat!.entropy).toBeGreaterThan(peaked!.entropy);
  });
});
