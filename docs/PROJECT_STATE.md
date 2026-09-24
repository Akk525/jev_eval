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

## Issue currently being worked on

None (landing #48).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Adaptive thresholds must cite a development/held-out source (D7). Confidence ≠ top-1 probability (D4). Figure 1 uses Execution Success Rate until E2E Task Success exists. Figure 2 uses priced cost only (provider-reported labeled separately).

M5 (#42–#45) stays blocked on calibration-bearing result dirs. M6 documents `#45` as skipped until those dirs exist.

## Known problems

- Live runs cost money and are not part of CI.
- **No result directories with varying Jev confidence** → cannot finish #42 or start #43–#45.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. With result dirs: `analysis:dataset` then `analysis:figure1` / `analysis:figure2`.
2. Next M6 figure issue: **#49** (latency vs N).
3. Or unlock M5 with a live Jev calibration-bearing slice when ready.

https://github.com/Akk525/jev_eval/issues/48
