import { describe, expect, it } from "vitest";
import { mcnemarExact, pairedBootstrapMeanDiff } from "./paired-uncertainty.js";

describe("pairedBootstrapMeanDiff", () => {
  it("recovers a known mean difference with a deterministic seed", () => {
    const pairs = [
      { a: 0, b: 1 },
      { a: 0, b: 1 },
      { a: 1, b: 1 },
      { a: 0, b: 0 },
    ];
    const result = pairedBootstrapMeanDiff(pairs, { replicates: 2000, seed: 42 });
    expect(result.n_pairs).toBe(4);
    expect(result.observed_mean_diff).toBeCloseTo(0.5);
    expect(result.ci_low).toBeLessThanOrEqual(result.observed_mean_diff);
    expect(result.ci_high).toBeGreaterThanOrEqual(result.observed_mean_diff);
    expect(result.note).toMatch(/task sample/);
  });
});

describe("mcnemarExact", () => {
  it("matches the M3 N=100 baseline vs top-5 discordance shape", () => {
    // Construct 54 both ok, 13 both fail, 6 a-only, 5 b-only → 78
    const pairs: { aSuccess: boolean; bSuccess: boolean }[] = [];
    for (let i = 0; i < 54; i++) pairs.push({ aSuccess: true, bSuccess: true });
    for (let i = 0; i < 13; i++) pairs.push({ aSuccess: false, bSuccess: false });
    for (let i = 0; i < 6; i++) pairs.push({ aSuccess: true, bSuccess: false });
    for (let i = 0; i < 5; i++) pairs.push({ aSuccess: false, bSuccess: true });
    const result = mcnemarExact(pairs);
    expect(result.a_only).toBe(6);
    expect(result.b_only).toBe(5);
    expect(result.discordant).toBe(11);
    expect(result.exact_two_sided_p).toBeGreaterThan(0.5); // highly non-significant
    expect(result.exact_two_sided_p).toBeLessThanOrEqual(1);
  });

  it("is 1 when there are no discordances", () => {
    expect(
      mcnemarExact([
        { aSuccess: true, bSuccess: true },
        { aSuccess: false, bSuccess: false },
      ]).exact_two_sided_p,
    ).toBe(1);
  });
});
