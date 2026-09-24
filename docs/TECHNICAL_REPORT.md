# Technical report — Jev tool-routing evaluation

Status: **pipeline complete; quantitative results pending live (or archived) result directories.**  
This document is the publication-facing narrative for M6. It must not be read as
evidence that Jev is better than an LLM. Negative and null findings are first-class.

Provenance gate: [reproducibility-audit.md](reproducibility-audit.md)  
Methodology: [methodology.md](methodology.md) · Decisions: [DECISIONS.md](DECISIONS.md)

## How to attach numbers (required before any claim)

```bash
npm run analysis:dataset -- --results <result-root> --out analysis/dataset
npm run analysis:audit -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure1 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure2 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure3 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure4 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure5 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure6 -- --dataset analysis/dataset/analysis-dataset.json
npm run summarize -- --results <result-root>
npm run k-sweep -- --tradeoff --results <k-sweep-root>
```

Every quantitative sentence below that is not marked **null** must cite one of:

| Claim class | Artifact to cite |
|---|---|
| ESR vs N | `analysis/figures/figure1/figure1-esr.json` (and/or `npm run summarize` rows) |
| Cost / tokens vs N | `analysis/figures/figure2/figure2-cost.json`, `figure2-tokens.json` |
| Latency vs N | `analysis/figures/figure3/figure3-latency.json` |
| Recall@k vs k | `analysis/figures/figure4/figure4-recall.json` |
| Jev calibration | `analysis/figures/figure5/figure5-calibration.json` |
| Failure mix | `analysis/figures/figure6/figure6-failures.json` |
| k tradeoff | `analysis/k-tradeoff.json` from `npm run k-sweep -- --tradeoff` |
| Adaptive routing | `analysis/adaptive/adaptive-summary.json` via `npm run analysis:adaptive` ([adaptive-summary-tables.md](adaptive-summary-tables.md)) |

If the citation path does not exist or `analysis:audit` fails, the claim is invalid.

---

## Research questions — current answers

### 1. How does agent tool selection behave as toolspace grows?

**Finding: null (no cited scaling result set on `main`).**

Expected evidence: Figure 1 Execution Success Rate vs N for baseline / Jev / LLM
([figure1-esr.md](figure1-esr.md)), plus `npm run summarize` architecture × N
tables. Denominator excludes R0 (D6).

Until regenerable `figure1-esr.json` exists from real dirs, we do **not** claim
that ESR falls, rises, or stays flat with N.

### 2. When does pre-routing become useful, if at all?

**Finding: null.**

“Useful” here means a favorable joint movement in ESR, cost, tokens, and/or
latency relative to baseline — not a single scalar win. Cite Figure 1 together
with Figure 2 and Figure 3 for the same compatibility key
(`analysis/dataset/compatibility.json`).

No crossover N is declared. Declaring one without those artifacts would violate
the audit.

### 3. What does Jev change in accuracy, cost, tokens, and latency?

**Finding: null for all four axes.**

| Axis | Metric | Artifact |
|---|---|---|
| Accuracy (MVP) | Execution Success Rate | Figure 1 |
| Cost | Priced cost/task (not provider-reported as substitute) | Figure 2a |
| Tokens | Router vs agent tokens/task | Figure 2b |
| Latency | Total p50 / p95 (router + agent); tool latency unavailable | Figure 3 |

Jev is one of three architectures. Comparisons must include baseline and LLM
router when those dirs exist. Framing the section as “Jev improvements” without
baselines is out of scope.

### 4. Where do failures move when pre-routing is introduced?

**Finding: null.**

Expected evidence: Figure 6 failure decomposition
([figure6-failures.md](figure6-failures.md)). R0 stays separate from R1–R6 (D6).
A shift from R2/R4 toward R1 (or the reverse) is only reportable with cited
counts from `figure6-failures.json`.

We explicitly do **not** treat infrastructure (R0) as evidence for or against
pre-routing quality.

### 5. What does k trade off?

**Finding: null for a winning k; method ready.**

M4 holds N = 25 and varies Jev `topK ∈ {1,3,5,10}` (D12). Cite:

* `npm run k-sweep -- --summarize` → per-k aggregates  
* `npm run k-sweep -- --tradeoff` → tradeoff table with `decision_rule: null`  
* Figure 4 strict vs lenient Recall@k vs k ([figure4-recall.md](figure4-recall.md))

**Negative finding (by design):** the harness does **not** select an optimal k.
Any future decision rule must be versioned separately and kept out of labeling
(D7).

### 6. Does Jev confidence provide enough signal for adaptive routing?

**Finding: thresholds locked; live adaptive ESR still null.**

Expected evidence: Figure 5 calibration of **confidence** and **top-1 probability
as separate series** ([figure5-calibration.md](figure5-calibration.md), D4), plus
calibration-bearing result dirs (`npm run check:calibration`).

Adaptive thresholds are locked in `policies/adaptive/v1.json` (D13: `T_low = 0.5`,
`T_high = 0.6`) from the development split of a live Jev result directory. Live
adaptive evaluation vs fixed-k (#44) has not run yet, so whether the policy
improves ESR remains unanswered. Top-1 must not be substituted for confidence (D4).

---

## Negative and null summary

| Topic | Status |
|---|---|
| Published ESR / cost / latency / recall curves | **Null** — regenerate after result dirs |
| “Pre-routing helps at N ≥ …” | **Null** — no crossover claim |
| “Optimal k = …” | **Negative / refused** — tradeoff only |
| “Jev is best on accuracy” | **Refused framing** |
| Adaptive routing from confidence | Thresholds locked (D13); summary tables ready (#45); live headline pending |
| Tool-executor latency in Figure 3 | **Unavailable** (not stored; not invented) |
| M5 adaptive summary tables | **Ready** — `npm run analysis:adaptive` when adaptive-eval dirs exist |

## What this harness *does* establish (non-numeric)

These are implementation facts, not benchmark scores:

* Fair comparison controls: shared agent, dataset, registry, pricing, evaluation (D1–D2, D10–D11).
* MVP metric is Execution Success Rate, not E2E Task Success (D3).
* Measurement SoT is `runs.jsonl`; figures rebuild from a normalized analysis dataset (#46–#53).
* Neutrality constraints are enforced in artifacts (no optimal-k field; separate confidence vs top-1).

## Editorial checklist (against the audit)

- [x] Every quantitative claim site identifies an artifact path (or is marked null).
- [x] Negative/null findings are listed explicitly.
- [x] Narrative does not claim Jev superiority.
- [x] Links to audit + figure docs.
- [x] M5 thresholds locked from calibration-bearing dirs (D13); adaptive ESR claims still omitted until #44.
- [ ] *Operator:* after live runs, fill numeric subsections by citing regenerated JSON only.

## Related paths

* Analysis dataset: [analysis-dataset.md](analysis-dataset.md)  
* Figures 1–6: `docs/figure{1..6}-*.md`  
* Audit: [reproducibility-audit.md](reproducibility-audit.md)  
* Project state: [PROJECT_STATE.md](PROJECT_STATE.md)
