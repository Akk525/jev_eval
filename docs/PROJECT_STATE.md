# Project state

Snapshot date: 2026-09-23

## Current milestone

M6 — Analysis + Publication (M5 adaptive tables deferred)

## Completed issues

- #1–#41 — M0–M4 path on `main` through the top-k tradeoff table.
- #42 — scaffolding only (methodology + checklist); thresholds not locked. Issue remains open.
- #46 — normalized analysis dataset builder (`npm run analysis:dataset`).
- #47 — Figure 1 ESR vs N (`npm run analysis:figure1`).
- #48 — Figure 2 cost + tokens vs N (`npm run analysis:figure2`).
- #49 — Figure 3 latency vs N (`npm run analysis:figure3`).
- #50 — Figure 4 Recall@k vs k (`npm run analysis:figure4`).

## Issue currently being worked on

None (landing #50).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Adaptive thresholds must cite a development/held-out source (D7). Confidence ≠ top-1 probability (D4). Strict vs lenient Recall@k stay distinct in Figure 4.

M5 (#42–#45) stays blocked on calibration-bearing result dirs. M6 documents `#45` as skipped until those dirs exist.

## Known problems

- Live runs cost money and are not part of CI.
- **No result directories with varying Jev confidence** → cannot finish #42 or start #43–#45.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. With result dirs: `analysis:dataset` then figures 1–4.
2. Next M6 figure issue: **#51** (calibration figure for Jev probabilities).
3. Or unlock M5 with a live Jev calibration-bearing slice when ready.

https://github.com/Akk525/jev_eval/issues/50
