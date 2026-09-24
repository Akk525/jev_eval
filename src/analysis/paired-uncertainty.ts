/**
 * Paired uncertainty helpers for shared-task comparisons.
 * Bootstrap is over the task sample (not run-to-run provider variance).
 * McNemar is exact binomial on discordant pairs only.
 */

export interface PairedBootstrapMeanDiff {
  n_pairs: number;
  observed_mean_diff: number;
  ci_low: number;
  ci_high: number;
  replicates: number;
  alpha: number;
  /** Explicit methodology pin. */
  note: string;
}

export interface McNemarExactResult {
  n_pairs: number;
  both_success: number;
  both_failure: number;
  /** a succeeds, b fails */
  a_only: number;
  /** b succeeds, a fails */
  b_only: number;
  discordant: number;
  exact_two_sided_p: number;
  note: string;
}

export const PAIRED_BOOTSTRAP_NOTE =
  "Paired bootstrap resamples the shared task IDs with replacement. " +
  "Intervals estimate uncertainty over this benchmark task sample, " +
  "not provider/run-to-run variance.";

export const MCNEMAR_NOTE =
  "Exact two-sided McNemar on discordant success/failure pairs only. " +
  "Reported subordinate to the observed Δ and discordance table; " +
  "not used to claim equivalence.";

/** Mulberry32 PRNG for deterministic bootstrap replicates. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap the mean of paired differences (b − a) across task-level observations.
 */
export function pairedBootstrapMeanDiff(
  pairs: readonly { a: number; b: number }[],
  options: { replicates?: number; seed?: number; alpha?: number } = {},
): PairedBootstrapMeanDiff {
  const replicates = options.replicates ?? 5000;
  const seed = options.seed ?? 0x5e9d0001;
  const alpha = options.alpha ?? 0.05;
  if (pairs.length === 0) {
    return {
      n_pairs: 0,
      observed_mean_diff: Number.NaN,
      ci_low: Number.NaN,
      ci_high: Number.NaN,
      replicates,
      alpha,
      note: PAIRED_BOOTSTRAP_NOTE,
    };
  }
  const diffs = pairs.map((p) => p.b - p.a);
  const observed = mean(diffs);
  const rng = mulberry32(seed);
  const boot: number[] = [];
  for (let r = 0; r < replicates; r++) {
    let sum = 0;
    for (let i = 0; i < diffs.length; i++) {
      const idx = Math.floor(rng() * diffs.length);
      sum += diffs[idx]!;
    }
    boot.push(sum / diffs.length);
  }
  boot.sort((x, y) => x - y);
  const loIdx = Math.floor((alpha / 2) * replicates);
  const hiIdx = Math.min(replicates - 1, Math.floor((1 - alpha / 2) * replicates));
  return {
    n_pairs: pairs.length,
    observed_mean_diff: observed,
    ci_low: boot[loIdx]!,
    ci_high: boot[hiIdx]!,
    replicates,
    alpha,
    note: PAIRED_BOOTSTRAP_NOTE,
  };
}

/** Exact two-sided McNemar for paired binary outcomes (a vs b). */
export function mcnemarExact(
  pairs: readonly { aSuccess: boolean; bSuccess: boolean }[],
): McNemarExactResult {
  let both_success = 0;
  let both_failure = 0;
  let a_only = 0;
  let b_only = 0;
  for (const p of pairs) {
    if (p.aSuccess && p.bSuccess) both_success += 1;
    else if (!p.aSuccess && !p.bSuccess) both_failure += 1;
    else if (p.aSuccess && !p.bSuccess) a_only += 1;
    else b_only += 1;
  }
  const discordant = a_only + b_only;
  return {
    n_pairs: pairs.length,
    both_success,
    both_failure,
    a_only,
    b_only,
    discordant,
    exact_two_sided_p: exactMcNemarP(a_only, b_only),
    note: MCNEMAR_NOTE,
  };
}

function exactMcNemarP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let cdf = 0;
  for (let i = 0; i <= k; i++) {
    cdf += binomialCoefficient(n, i) * 2 ** -n;
  }
  return Math.min(1, 2 * cdf);
}

function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  const kk = Math.min(k, n - k);
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
