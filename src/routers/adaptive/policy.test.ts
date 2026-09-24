import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  branchForConfidence,
  loadAdaptivePolicy,
  type AdaptivePolicy,
} from "./policy.js";

describe("loadAdaptivePolicy", () => {
  it("loads the locked v1 policy with concrete thresholds", () => {
    const policy = loadAdaptivePolicy(resolve("policies/adaptive/v1.json"));
    expect(policy.version).toBe("adaptive-policy-v1");
    expect(policy.status).toBe("thresholds_locked");
    expect(policy.thresholds).toEqual({ T_low: 0.5, T_high: 0.6 });
    expect(policy.confidence_field).toBe("confidence");
    expect(policy.never_use_top1_probability_as_confidence).toBe(true);
    expect(policy.branches.map((branch) => branch.id)).toEqual(["high", "medium", "low"]);
  });

  it("rejects a pending policy without thresholds", () => {
    expect(() => loadAdaptivePolicy(resolve("policies/adaptive/v0.pending.json"))).toThrow(
      /thresholds/,
    );
  });
});

describe("branchForConfidence", () => {
  const policy = loadAdaptivePolicy(resolve("policies/adaptive/v1.json"));

  it("selects high / medium / low from confidence only (never top1)", () => {
    expect(branchForConfidence(0.6, policy).id).toBe("high");
    expect(branchForConfidence(0.55, policy).id).toBe("medium");
    expect(branchForConfidence(0.49, policy).id).toBe("low");
  });
});

describe("checked-in v1 file", () => {
  it("remains parseable JSON with D13 thresholds", () => {
    const raw = JSON.parse(readFileSync(resolve("policies/adaptive/v1.json"), "utf8")) as AdaptivePolicy;
    expect(raw.thresholds?.T_low).toBe(0.5);
    expect(raw.thresholds?.T_high).toBe(0.6);
  });
});
