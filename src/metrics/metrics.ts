import type { TokenUsage } from "../types/usage.js";

const Z_95 = 1.96;

export interface ModelPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface ExecutionAttempt {
  /** True when D6 excludes this attempt from the execution denominator. */
  executionExcluded: boolean;
  executionSuccess: boolean;
}

export interface LatencySummary {
  mean: number | null;
  median: number | null;
  p50: number | null;
  p95: number | null;
}

export interface SampleSummary {
  mean: number | null;
  /** Sample standard deviation (n − 1). Null when n < 2. */
  stddev: number | null;
  ci95Low: number | null;
  ci95High: number | null;
}

/** Fraction of required tools present in the top k. Null when nothing is required. */
export function recallAtK(
  required: readonly string[],
  candidates: readonly string[],
  k: number,
): number | null {
  return coverage(required, candidates, k);
}

/**
 * 1 when top-k contains any required or acceptable tool, otherwise 0.
 * Null when both sets are empty. This does not replace primary Recall@k.
 */
export function lenientRecallAtK(
  required: readonly string[],
  acceptable: readonly string[],
  candidates: readonly string[],
  k: number,
): number | null {
  const targets = unique([...required, ...acceptable]);
  if (targets.length === 0) return null;
  const top = new Set(candidates.slice(0, Math.max(0, k)));
  return targets.some((tool) => top.has(tool)) ? 1 : 0;
}

/**
 * 1 when the selected tool is required and at least one required tool was available.
 * Null when no required tool was available, so the attempt stays out of the denominator.
 */
export function selectionHit(
  required: readonly string[],
  available: readonly string[],
  selected: string | null,
): number | null {
  const availableSet = new Set(available);
  if (!required.some((tool) => availableSet.has(tool))) return null;
  if (selected !== null && required.includes(selected)) return 1;
  return 0;
}

/** Successes over attempts that are not execution-excluded. Null when none are scored. */
export function executionSuccessRate(attempts: readonly ExecutionAttempt[]): number | null {
  const scored = attempts.filter((attempt) => !attempt.executionExcluded);
  if (scored.length === 0) return null;
  const successes = scored.filter((attempt) => attempt.executionSuccess).length;
  return successes / scored.length;
}

export function pricedCostUsd(usage: TokenUsage, price: ModelPrice): number {
  return (
    (usage.inputTokens / 1_000_000) * price.inputUsdPerMillion +
    (usage.outputTokens / 1_000_000) * price.outputUsdPerMillion
  );
}

/** Nearest-rank percentiles. `median` and `p50` are the same value. */
export function summarizeLatency(valuesMs: readonly number[]): LatencySummary {
  if (valuesMs.length === 0) return { mean: null, median: null, p50: null, p95: null };
  const sorted = [...valuesMs].sort((left, right) => left - right);
  const p50 = nearestRank(sorted, 50);
  return {
    mean: mean(sorted),
    median: p50,
    p50,
    p95: nearestRank(sorted, 95),
  };
}

export function summarizeSamples(values: readonly number[]): SampleSummary {
  if (values.length === 0) return { mean: null, stddev: null, ci95Low: null, ci95High: null };
  const sampleMean = mean(values);
  if (values.length < 2) return { mean: sampleMean, stddev: null, ci95Low: null, ci95High: null };
  const variance =
    values.reduce((sum, value) => sum + (value - sampleMean) ** 2, 0) / (values.length - 1);
  const stddev = Math.sqrt(variance);
  const margin = Z_95 * (stddev / Math.sqrt(values.length));
  return {
    mean: sampleMean,
    stddev,
    ci95Low: sampleMean - margin,
    ci95High: sampleMean + margin,
  };
}

function coverage(targets: readonly string[], candidates: readonly string[], k: number): number | null {
  if (targets.length === 0) return null;
  const top = new Set(candidates.slice(0, Math.max(0, k)));
  const hits = targets.filter((tool) => top.has(tool)).length;
  return hits / targets.length;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}
