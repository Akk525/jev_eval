# Project state

Snapshot date: 2026-09-23

## Current milestone

M6 — Analysis + Publication (M5 adaptive tables deferred / skipped in analysis dataset)

## Completed issues

- #1–#41 — M0–M4 path on `main` through the top-k tradeoff table.
- #42 — scaffolding only (methodology + checklist); thresholds not locked. Issue remains open.
- #46 — normalized analysis dataset builder on `main` (`npm run analysis:dataset`).

## Issue currently being worked on

None (landing #46).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Adaptive thresholds must cite a development/held-out source (D7). Confidence ≠ top-1 probability (D4).

M5 (#42–#45) stays blocked on calibration-bearing result dirs. M6.1 documents `#45` as skipped until those dirs exist (`docs/analysis-dataset.md`).

## Known problems

- Live runs cost money and are not part of CI.
- **No result directories with varying Jev confidence** → cannot finish #42 or start #43–#45.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. `npm run analysis:dataset -- --results <result-root> --out analysis/dataset` once result dirs exist, **or**
2. Run a live Jev slice for #42 when ready to unlock M5:
   `npm run eval -- --config configs/jev-top5-20.yaml` (needs `AGENT_API_KEY` + `TYPESAFE_API_KEY`)
3. Next M6 figure issue: #47 (ESR vs N) once a normalized dataset can be built from real or fixture dirs.

https://github.com/Akk525/jev_eval/issues/46
