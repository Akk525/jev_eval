# Technical report — Jev tool-routing evaluation

Status: **live evidence frozen; publication synthesis regenerable.**  
This document is the publication-facing narrative for M6. It must not be read as
evidence that Jev is better than an LLM. Negative and null findings are first-class.

Provenance gate: [reproducibility-audit.md](reproducibility-audit.md)  
Methodology: [methodology.md](methodology.md) · Decisions: [DECISIONS.md](DECISIONS.md)  
Synthesis SoT: [`analysis/synthesis/`](../analysis/synthesis/) (`synthesis.json` canonical; SVG derived)

## How to attach numbers (required before any claim)

```bash
npm run analysis:synthesis
npm run summarize -- --manifest results/_matrix/2026-09-24T055854Z.json
npm run k-sweep -- --tradeoff --manifest results/_k-sweep/2026-09-24T140621Z.json
```

Legacy figure CLIs remain available when an analysis dataset is built; prefer synthesis
citations for M3/M4 claims (D15 — manifest-scoped only; never bare `--results results`).

Every quantitative sentence below that is not marked **null** must cite one of:

| Claim class | Artifact to cite |
|---|---|
| ESR vs N | `analysis/synthesis/figures/esr-vs-n.json` (and/or `figure1-esr.json`) |
| Cost / tokens vs N | `analysis/synthesis/figures/cost-vs-n.json`, `agent-tokens-vs-n.json` (and/or `figure2-cost.json`, `figure2-tokens.json`) |
| Latency vs N | `figure3-latency.json` — **not** a headline synthesis panel |
| Recall@k / ESR / sel vs k | `analysis/synthesis/figures/k-ablation.json` (and/or `figure4-recall.json`) |
| Jev calibration / adaptive | `analysis/synthesis/figures/adaptive-calibration.json`, `figure5-calibration.json` |
| Failure mix | `analysis/synthesis/figures/failure-decomposition.json` (and/or `figure6-failures.json`) |
| Cost–ESR frontier | `analysis/synthesis/figures/cost-esr-frontier.json` |
| M3↔M4 reproducibility | `analysis/synthesis/figures/reproducibility.json` |
| k tradeoff | `analysis/m4-freeze/k-tradeoff.json` (`decision_rule: null`) |
| Adaptive routing | `analysis/adaptive/adaptive-summary.json` |

If the citation path does not exist, the claim is invalid.

---

## Research questions — current answers

### 1. How does agent tool selection behave as toolspace grows?

**Finding: ESR does not collapse with N on this benchmark (M3).**

Cite: `analysis/synthesis/figures/esr-vs-n.json` / `synthesis.md`.  
Baseline ESR at N=100 remains ~0.77; Jev top-5 tracks baseline within a few points;
top-1 lags as Recall@1 falls. R0 = 0 on the frozen matrix. Denominator excludes R0 (D6).

LLM router comparison: **Finding: null** (LLM top-5 archived out of M3; D11).

### 2. When does pre-routing become useful, if at all?

**Finding: cost/context separation is large at N=100; ESR Δ vs baseline is small and uncertain.**

Cite: `cost-vs-n.json`, `agent-tokens-vs-n.json`, `cost-esr-frontier.json`, and the
paired N=100 baseline vs top-5 block in `synthesis.json`:

| Quantity | Value |
|---|---|
| Observed ΔESR (top-5 − baseline) | −0.0128 |
| Paired bootstrap 95% CI | [−0.1026, 0.0641] |
| Discordant: baseline-only / top5-only | 6 / 5 |
| McNemar exact two-sided p | 1.000 |

Framing (not an equivalence claim): observed difference small; discordance nearly
balanced; uncertainty too large for equivalence. Cost CI is **task-sample**
uncertainty (paired bootstrap over 78 tasks), not run-to-run variance.

No crossover N is declared as a product threshold.

### 3. What does Jev change in accuracy, cost, tokens, and latency?

| Axis | Finding | Artifact |
|---|---|---|
| Accuracy (MVP) | Small ΔESR vs baseline at N=100; CI wide | `synthesis.json` paired block; `esr-vs-n.json` |
| Cost | Baseline ~8× from N=5→100; top-5 flat | `cost-vs-n.json` |
| Tokens | Top-5 keeps agent context flat; router absorbs N | `agent-tokens-vs-n.json` |
| Latency | **Finding: null for headline claims** — epoch variation too large | omit from synthesis panels; see `figure3-latency.json` if needed |

### 4. Where do failures move when pre-routing / k changes?

**Finding: R1 falls with larger k; R2 appears as selection pressure; R3≈stable task set.**

Cite: `failure-decomposition.json` (M4 R1/R2 vs k) and M3 paired analysis
(`docs/m3-paired-scaling-analysis.md`). Persistent R3/R4 tasks remain in the
benchmark (not removed from M3).

### 5. What does k trade off?

**Finding: tradeoff curve only — no winning k (`decision_rule: null`).**

M4 holds N = 100 and varies Jev `topK ∈ {1,3,5,10}` (D14), fresh four-cell run
`2026-09-24T140621Z` @ `5f9e7c3`. Cite:

* `analysis/synthesis/figures/k-ablation.json`
* `npm run k-sweep -- --tradeoff --manifest results/_k-sweep/2026-09-24T140621Z.json`
* `npm run k-sweep -- --marginal-utility --manifest …` (coverage vs utility)
* `figure4-recall.json` when regenerated from a compatible dataset

**Negative finding (by design):** the harness does **not** select an optimal k.

### 6. Does Jev confidence provide enough signal for adaptive routing?

**Finding: negative on the first live holdout — stop confidence→k retuning.**

Evidence: adaptive-eval `2026-09-24T045743Z` via `npm run analysis:adaptive`, plus
`analysis/synthesis/figures/adaptive-calibration.json` and holdout decomposition
([holdout-top5-decomposition.md](holdout-top5-decomposition.md)). Figure 5 remains
the calibration SoT (`figure5-calibration.json`, D4).

Frozen holdout conclusion:

> The holdout supports fixed top-k routing as the next hypothesis to test.

---

## Refused framing

* Superiority slogans without baselines and cited artifacts.
* Equivalence of top-5 and baseline from a non-significant McNemar or overlapping CI.
* Optimal k from the M4 curve without a predeclared decision rule.
* Independent two-proportion tests on paired shared-task cells.
* Mixing M3 and M4 directories in one aggregate (D15).

## Checklist

- [x] M3 live matrix frozen and analyzed.
- [x] M4 live k-ablation frozen; synthesis regenerable.
- [x] Adaptive confidence→k stopped (negative holdout).
- [x] Manifest-scoped analysis (D15).
- [ ] External paper draft using `analysis/synthesis/rendered/*.svg`.
