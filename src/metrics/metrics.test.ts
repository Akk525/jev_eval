import { expect, it } from "vitest";
import {
  executionSuccessRate,
  lenientRecallAtK,
  pricedCostUsd,
  recallAtK,
  selectionHit,
  summarizeLatency,
  summarizeSamples,
} from "./metrics.js";

it("does not count an acceptable-only hit as primary recall", () => {
  const candidates = ["search_files", "read_email"];
  expect(recallAtK(["search_email"], candidates, 1)).toBe(0);
  expect(lenientRecallAtK(["search_email"], ["search_files"], candidates, 1)).toBe(1);
});

it("uses the full candidate list when k is larger than the list", () => {
  expect(recallAtK(["search_email"], ["search_email"], 10)).toBe(1);
});

it("returns null recall when nothing is required", () => {
  expect(recallAtK([], ["search_email"], 1)).toBeNull();
});

it("scores multi-tool recall as the covered fraction", () => {
  expect(recallAtK(["search_email", "read_email"], ["search_email", "write_file"], 2)).toBe(0.5);
});

it("excludes selection accuracy when the required tool was unavailable", () => {
  expect(selectionHit(["search_email"], ["search_files"], "search_files")).toBeNull();
  expect(selectionHit(["search_email"], ["search_email", "search_files"], "search_files")).toBe(0);
  expect(selectionHit(["search_email"], ["search_email"], "search_email")).toBe(1);
});

it("keeps execution-excluded attempts out of Execution Success Rate", () => {
  const rate = executionSuccessRate([
    { executionExcluded: true, executionSuccess: false },
    { executionExcluded: false, executionSuccess: true },
    { executionExcluded: false, executionSuccess: false },
  ]);
  expect(rate).toBe(0.5);
});

it("returns null Execution Success Rate when every attempt is excluded", () => {
  expect(executionSuccessRate([{ executionExcluded: true, executionSuccess: false }])).toBeNull();
});

it("prices tokens from a per-million table", () => {
  expect(
    pricedCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
    ),
  ).toBe(6);
});

it("summarizes latency with nearest-rank percentiles", () => {
  expect(summarizeLatency([10, 20, 30, 40, 50])).toEqual({
    mean: 30,
    median: 30,
    p50: 30,
    p95: 50,
  });
  expect(summarizeLatency([])).toEqual({ mean: null, median: null, p50: null, p95: null });
});

it("reports a sample standard deviation and 95% interval", () => {
  const summary = summarizeSamples([1, 2, 3]);
  expect(summary.mean).toBe(2);
  expect(summary.stddev).toBe(1);
  expect(summary.ci95Low).toBeCloseTo(2 - 1.96 / Math.sqrt(3));
  expect(summary.ci95High).toBeCloseTo(2 + 1.96 / Math.sqrt(3));
  expect(summarizeSamples([4])).toEqual({ mean: 4, stddev: null, ci95Low: null, ci95High: null });
});
