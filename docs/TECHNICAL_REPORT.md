# Technical report — Jev tool-routing evaluation

**Publication checkpoint:** `ed3dd18`  
Status: **experimental machinery frozen.** Evidence regenerates from three epoch
manifests only. This document must not be read as evidence that Jev is better
than an LLM. Negative and null findings are first-class.

Provenance: [reproducibility-audit.md](reproducibility-audit.md) ·
[methodology.md](methodology.md) · [DECISIONS.md](DECISIONS.md)  
Canonical numbers: [`analysis/synthesis/synthesis.json`](../analysis/synthesis/synthesis.json)  
Narrative companion: [`analysis/synthesis/synthesis.md`](../analysis/synthesis/synthesis.md)  
Figures: `analysis/synthesis/figures/*.json` → `rendered/*.svg`

```bash
npm run analysis:synthesis   # only regenerator for publication claims (D15/D16)
```

---

## Thesis

> **Pre-routing does not simply make large toolspaces “work.” Large toolspaces
> remained usable in this benchmark. Instead, pre-routing changes the economics
> and failure structure of tool use: it keeps expensive reasoning-model context
> nearly constant as the available capability space grows, while introducing a
> tradeoff between routing coverage and downstream selection difficulty.**

The systems result that follows:

> **The interesting problem isn't merely finding the right tool. It's
> controlling how much of the capability space reaches the expensive reasoning
> model.**

Jev is treated here as one cheap retrieval mechanism under measurement—not as
magic. The contribution is where the boundary between **cheap retrieval** and
**expensive reasoning** becomes useful, and where it breaks down.

---

## Checkpoint (do not reopen without a new freeze)

| Epoch | Manifest | Commit |
|---|---|---|
| M3 scaling matrix | `results/_matrix/2026-09-24T055854Z.json` | `fc9fb2a` |
| M4 k-ablation | `results/_k-sweep/2026-09-24T140621Z.json` | `5f9e7c3` |
| Adaptive holdout | `results/_adaptive-eval/2026-09-24T045743Z.json` | (see adaptive summary) |
| Analysis / publication | regenerable SoT at | **`ed3dd18`** |

No further benchmark modifications, k experiments, adaptive policies, or live
runs unless a write-up exposes a separately preregistered follow-up question.

Every quantitative claim below cites a path under `analysis/synthesis/` (or a
named freeze artifact). Legacy `figure1-esr.json` … `figure6-failures.json`
remain valid citation classes when regenerated from a compatible dataset; prefer
synthesis for M3/M4.

| Claim class | Cite |
|---|---|
| ESR vs N | `figures/esr-vs-n.json` (and/or `figure1-esr.json`) |
| Cost / tokens vs N | `figures/cost-vs-n.json`, `agent-tokens-vs-n.json` (and/or `figure2-cost.json`, `figure2-tokens.json`) |
| Latency | **not** a headline panel — `figure3-latency.json` only if needed |
| k ablation | `figures/k-ablation.json` (and/or `figure4-recall.json`) |
| Failures vs k | `figures/failure-decomposition.json` (and/or `figure6-failures.json`) |
| Cost–ESR frontier | `figures/cost-esr-frontier.json` |
| Reproducibility | `figures/reproducibility.json` |
| Adaptive | `figures/adaptive-calibration.json`, `figure5-calibration.json`, `analysis/adaptive/adaptive-summary.json` |
| k tradeoff | `analysis/m4-freeze/k-tradeoff.json` (`decision_rule: null`) |

---

## Experiment sequence

### M3 — Scaling (toolspace size N)

Full-toolspace reasoning remained reasonably stable through **N = 100**, but its
inference cost scaled sharply. Fixed top-k routing kept downstream context and
cost comparatively flat while redistributing failures.

Cite: `esr-vs-n.json`, `cost-vs-n.json`, `agent-tokens-vs-n.json`.

| N | Baseline ESR | Top-1 ESR | Top-5 ESR |
|---:|---:|---:|---:|
| 5 | 0.808 | 0.769 | 0.821 |
| 100 | 0.769 | 0.692 | 0.756 |

| Series | $/attempt N=5 → N=100 | Ratio | Mean agent tokens N=5 → N=100 |
|---|---:|---:|---|
| Baseline | 0.00145 → 0.01224 | **~8.5×** | 282 → **2982** |
| Jev top-1 | 0.00101 → 0.00110 | ~1.09× | 169 → 169 |
| Jev top-5 | 0.00146 → 0.00157 | ~1.07× | 282 → 290 |

**Finding:** ESR does **not** collapse with N on this benchmark. What collapses
(for baseline) is the economics of stuffing the full toolspace into the agent.
LLM router comparison: **Finding: null** (LLM top-5 archived out of M3; D11).

At N=100, baseline vs Jev top-5 on the same 78 tasks
(`synthesis.json` → `panels.n100_baseline_vs_top5`):

| Quantity | Value |
|---|---|
| Observed ΔESR (top-5 − baseline) | **−0.0128** |
| Paired bootstrap 95% CI | **[−0.1026, 0.0641]** |
| Discordant: baseline-only / top5-only | **6 / 5** |
| Both success / both failure | 54 / 13 |
| McNemar exact two-sided p | 1.000 |

The 6-vs-5 discordance table is the most intuitive statement of the result.
McNemar is supporting analysis, not the headline. Framing: observed difference
small; uncertainty too large for an **equivalence** claim. Cost paired
intervals estimate uncertainty over **this task sample**, not run-to-run
provider variance.

### M4 — Candidate-set size k (fixed N=100)

Increasing k improved retrieval coverage, but coverage did not translate
one-for-one into successful execution. Larger candidate sets recovered some
routing misses while reintroducing downstream selection errors.

Cite: `k-ablation.json`, `failure-decomposition.json`,
`analysis/m4-freeze/marginal-utility.json` (`decision_rule: null`).

| k | Strict R@k | ESR | Sel. acc. | Agent tok (mean) | $/attempt |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.872 | 0.705 | 1.000 | 169 | 0.00109 |
| 3 | 0.949 | 0.731 | 0.892 | 230 | 0.00133 |
| 5 | 0.949 | 0.756 | 0.865 | 290 | 0.00157 |
| 10 | 0.962 | 0.769 | 0.853 | 444 | 0.00219 |

Marginal utility (adjacent k): most of the **routing coverage** gain is in
`1→3` (+6 tasks enter the candidate set; only 2 of those become successes).
`3→5` adds **no** new coverage; `5→10` adds 1 coverage task and 0 utility
successes. R1 falls as k grows; R2 appears as selection pressure. R3 remains
~fixed (routing-insensitive tasks stay in the benchmark).

**Finding:** tradeoff curve only — **no winning k**.

### Adaptive — Can confidence choose k automatically?

**Finding: negative** on the first live holdout. High-confidence routing errors
prevented the tested confidence→k policy from separating cases well enough; the
policy collapsed largely toward k=1. Stop further threshold fitting (D13).

Cite: `adaptive-calibration.json`, `analysis/adaptive/adaptive-summary.json`,
[holdout-top5-decomposition.md](holdout-top5-decomposition.md),
`figure5-calibration.json` (D4).

> The holdout supports fixed top-k routing as the next hypothesis to test.

---

## Research questions (checklist form)

### 1. How does agent tool selection behave as toolspace grows?

**Finding:** ESR stable enough that “large N breaks agents” is the wrong default
story here (`esr-vs-n.json`). Cost/context is where N hurts baseline.

### 2. When does pre-routing become useful, if at all?

**Finding:** useful as an **economic and failure-structure** control at large N,
not as a free ESR upgrade. Paired ΔESR at N=100 is tiny with a CI that crosses
zero (`synthesis.json`).

### 3. What does Jev change in accuracy, cost, tokens, and latency?

| Axis | Finding | Cite |
|---|---|---|
| Accuracy | Small, uncertain ΔESR vs baseline at N=100 | paired block |
| Cost | Baseline ~8.5× N=5→100; top-k ~flat | `cost-vs-n.json` |
| Tokens | Top-k holds agent context nearly constant | `agent-tokens-vs-n.json` |
| Latency | **Finding: null for headline claims** (epoch variation) | omit; `figure3-latency.json` only if needed |

### 4. Where do failures move?

**Finding:** larger k reduces R1 and can raise R2; R3≈stable task set
(`failure-decomposition.json`; M3 paired notes).

### 5. What does k trade off?

**Finding:** coverage vs selection vs cost curve; `decision_rule: null`; no
optimal k (`k-ablation.json`, M4 tradeoff/marginal artifacts).

### 6. Does Jev confidence provide enough signal for adaptive routing?

**Finding: negative** — stop confidence→k retuning.

---

## Refused framing

* Superiority slogans without baselines and cited artifacts.
* Equivalence of top-5 and baseline from a non-significant McNemar or overlapping CI.
* Optimal k from the M4 curve without a predeclared decision rule.
* Independent two-proportion tests on paired shared-task cells.
* Mixing M3 and M4 epochs in one aggregate (D15).
* Reopening experimental machinery without a new freeze (D16).

## Checklist

- [x] M3 / M4 / adaptive live evidence frozen.
- [x] Manifest-scoped analysis (D15); synthesis regenerable.
- [x] Publication checkpoint `ed3dd18` (D16).
- [x] Thesis stated without router mythology.
- [ ] External venue draft (optional) using `analysis/synthesis/rendered/*.svg`.
