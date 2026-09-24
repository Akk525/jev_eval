# Project state

Snapshot date: 2026-09-24

## Current milestone

M5 — Adaptive Routing (**complete**; first live holdout recorded as a **negative result** on confidence→k). Project focus shifts to scaling **fixed Jev top-5** vs baseline (M3-scale), not further adaptive threshold fitting.

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #43 — adaptive `Router` behind the existing interface; run records carry branch/k/escalation.
- #44 — adaptive vs fixed-k eval configs, holdout split, aggregator, mock path.
- #45 — adaptive summary tables (comparison + branch usage; no superiority claim).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

None. Post-M5 analysis: holdout top-1 vs top-5 decomposition ([holdout-top5-decomposition.md](holdout-top5-decomposition.md)).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D13). Adaptive branches use provider `confidence` only (D4). #44 holdout = odd FNV-1a `taskId` hash (complement of #42 development). OpenAI Chat Completions tool calls send `reasoning_effort: "none"` for `gpt-5.6-sol`. Adaptive summary tables prefer `_adaptive-eval` manifests so older same-N/k dirs are not merged.

## Known problems

- Live runs cost money and are not part of CI.
- First adaptive holdout (`2026-09-24T045743Z`, n=24/cell): adaptive collapsed to high→k=1 (0 escalations); confidence insufficiently discriminative for the v1 policy — **stop retuning thresholds**.
- n=24 is too small to claim top-5 accuracy > baseline; direction favors studying fixed top-5 at larger N.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep use v0.2.
- Local `results/` are gitignored; threshold_source cites a path that must be retained on disk for audit.

## Open questions

- Does score-shape (margin / entropy) separate top-1 routing errors better than scalar confidence on a larger sample? Exploratory only — not a new policy yet.
- Fill [docs/TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) numeric subsections only from regenerated figure / adaptive-summary / holdout-decomposition JSON.

## Next recommended action

1. **Scaling matrix (new runs only):** baseline vs Jev top-1 (control) vs Jev top-5 (treatment) at N ∈ {5, 10, 25, 50, 100}. Primary question: does top-5 preserve ESR while cutting context/cost/latency vs full toolspace? Secondary: does pre-routing shift failures from routing/overload toward R2 selection as N grows?
2. Do **not** retune adaptive `T_low`/`T_high` or re-optimize against the n=24 holdout.
3. Optionally regenerate figures 1–6 + TECHNICAL_REPORT numerics from live dirs.
