# Project state

Snapshot date: 2026-09-23

## Current milestone

M6 — Analysis + Publication (M5 adaptive tables deferred)

## Completed issues

- #1–#41 — M0–M4 path on `main` through the top-k tradeoff table.
- #42 — scaffolding only (methodology + checklist); thresholds not locked. Issue remains open.
- #46 — normalized analysis dataset builder (`npm run analysis:dataset`).
- #47–#51 — Figures 1–5 (ESR, cost/tokens, latency, Recall@k, Jev calibration).
- #52 — Figure 6 failure decomposition (`npm run analysis:figure6`).

## Issue currently being worked on

None (landing #52).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). R0 stays separate from scientific failures in Figure 6 (D6). Confidence ≠ top-1 (D4).

M5 (#42–#45) stays blocked on calibration-bearing result dirs. M6 documents `#45` as skipped until those dirs exist.

## Known problems

- Live runs cost money and are not part of CI.
- **No result directories with varying Jev confidence** → cannot finish #42 or start #43–#45.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. With result dirs: `analysis:dataset` then figures 1–6.
2. Next M6 issue: **#53** (methodology and reproducibility audit).
3. Or unlock M5 with a live Jev calibration-bearing slice when ready.

https://github.com/Akk525/jev_eval/issues/52
