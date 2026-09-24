import { describe, expect, it } from "vitest";
import {
  isDevelopmentTask,
  rankToolsByScore,
  selectAdaptiveThresholds,
  simulatePolicyHit,
  type ThresholdAttempt,
} from "./adaptive-threshold-select.js";

describe("isDevelopmentTask", () => {
  it("splits by even taskId hash (dev) vs odd (holdout)", () => {
    const ids = ["task_0001", "task_0002", "task_0003", "task_0010"];
    const flags = ids.map(isDevelopmentTask);
    expect(flags.some(Boolean)).toBe(true);
    expect(flags.some((value) => !value)).toBe(true);
    for (const id of ids) {
      expect(isDevelopmentTask(id)).toBe(isDevelopmentTask(id));
    }
  });
});

describe("rankToolsByScore", () => {
  it("orders by score descending then name for ties", () => {
    expect(
      rankToolsByScore({
        b: 0.2,
        a: 0.5,
        c: 0.5,
      }),
    ).toEqual(["a", "c", "b"]);
  });
});

describe("simulatePolicyHit", () => {
  const scores = { gold: 0.6, distractor: 0.4, other: 0.1 };

  it("high branch needs gold in top-1; medium uses top-5; escalate covers full toolspace", () => {
    expect(simulatePolicyHit({ scores, requiredTools: ["gold"], branch: "high", highK: 1, mediumK: 5 })).toBe(1);
    expect(simulatePolicyHit({ scores, requiredTools: ["distractor"], branch: "high", highK: 1, mediumK: 5 })).toBe(
      0,
    );
    expect(
      simulatePolicyHit({
        scores: { distractor: 0.9, gold: 0.1 },
        requiredTools: ["gold"],
        branch: "medium",
        highK: 1,
        mediumK: 5,
      }),
    ).toBe(1);
    expect(
      simulatePolicyHit({
        scores,
        requiredTools: ["gold"],
        branch: "low",
        highK: 1,
        mediumK: 5,
      }),
    ).toBe(1);
  });
});

describe("selectAdaptiveThresholds", () => {
  it("picks T_low/T_high on the development split only and never uses top1Probability", () => {
    const attempts: ThresholdAttempt[] = [
      // Dev (even hash): high confidence, gold is top-1 → prefer high branch
      attempt("task_0001", 0.95, { gold: 0.9, noise: 0.1 }, ["gold"]),
      attempt("task_0003", 0.9, { gold: 0.8, noise: 0.2 }, ["gold"]),
      // Dev: low confidence, gold buried → needs escalate (full coverage)
      attempt("task_0005", 0.15, { noise: 0.9, gold: 0.05 }, ["gold"]),
      attempt("task_0007", 0.2, { noise: 0.85, gold: 0.05 }, ["gold"]),
      // Holdout (must not drive selection): would prefer different thresholds if used
      attempt("task_0002", 0.99, { noise: 0.99, gold: 0.01 }, ["gold"]),
      attempt("task_0004", 0.01, { gold: 0.99, noise: 0.01 }, ["gold"]),
    ];

    const result = selectAdaptiveThresholds(attempts, {
      grid: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      highK: 1,
      mediumK: 5,
    });

    expect(result.status).toBe("locked");
    if (result.status !== "locked") return;
    expect(result.thresholds.T_low).toBeLessThan(result.thresholds.T_high);
    expect(result.development_n).toBe(4);
    expect(result.holdout_n).toBe(2);
    expect(result.objective.dev_hit_rate).toBe(1);
    // Escalation for the two low-confidence misses keeps mean k below always-medium.
    expect(result.thresholds.T_low).toBeGreaterThan(0);
  });

  it("returns negative when confidence is not predictive of routing hits on development", () => {
    // Known development ids; high confidence systematically misses top-1.
    const devIds = [
      "task_0001",
      "task_0003",
      "task_0005",
      "task_0007",
      "task_0009",
      "task_0010",
      "task_0012",
      "task_0014",
      "task_0016",
      "task_0018",
      "task_0021",
      "task_0023",
    ];
    const attempts: ThresholdAttempt[] = devIds.map((id, index) => {
      const highConf = index < 6;
      return attempt(
        id,
        highConf ? 0.95 : 0.1,
        highConf ? { noise: 0.9, gold: 0.05 } : { gold: 0.9, noise: 0.05 },
        ["gold"],
      );
    });
    const result = selectAdaptiveThresholds(attempts, {
      grid: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      highK: 1,
      mediumK: 5,
    });
    expect(result.status).toBe("negative");
  });
});

function attempt(
  taskId: string,
  confidence: number,
  scores: Record<string, number>,
  requiredTools: string[],
): ThresholdAttempt {
  return { taskId, confidence, scores, requiredTools, top1Probability: 0.5 };
}
