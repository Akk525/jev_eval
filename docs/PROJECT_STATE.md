# Project state

Snapshot date: 2026-09-23

## Current milestone

M6 — Analysis + Publication (M5 adaptive tables deferred)

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — scaffolding only; thresholds not locked (open).
- #46–#52 — analysis dataset + figures 1–6.
- #53 — methodology / reproducibility audit (`docs/reproducibility-audit.md`, `npm run analysis:audit`).

## Issue currently being worked on

None (landing #53).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Pipeline audit PASS; quantitative claims PENDING live result dirs. M5/#45 skipped until #42 locks thresholds.

## Known problems

- Live runs cost money and are not part of CI.
- **No calibration-bearing result directories** → cannot finish #42 or start #43–#45.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. Run live (or mock) result dirs → `analysis:dataset` → `analysis:audit` → figures 1–6.
2. Next issue: **#54** publication-ready technical report / README results section (only with regenerable numbers).
3. Or unlock M5 when calibration-bearing Jev dirs exist.

https://github.com/Akk525/jev_eval/issues/53
