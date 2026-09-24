# Project state

Snapshot date: 2026-09-23

## Current milestone

M4 — Top-k Ablations

## Completed issues

- #1–#30 — M0–M2 closed on `main` (including live LLM path).
- #31–#38 — M3 scaling path on `main` (catalog, toolspaces, v0.2, N-matrix, orchestration, reps/stats, concurrency, summary tables).
- #39 Add Jev top-k sweep experiment configs — on `main`. `configs/k-sweep/` at N=25, k∈{1,3,5,10} (D12).
- #40 Execute and aggregate top-k ablation metrics — on `main`. `npm run k-sweep` (+ `--summarize` per-k JSON/CSV from raw dirs).

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). M4 k-sweep fixes N=25 and varies only Jev `topK`. Aggregates recompute from `runs.jsonl` only; no optimal-k claim in #40 artifacts.

## Known problems

- Live runs cost money and are not part of CI.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.
- M5 blocked on real calibration-bearing result directories.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#41 Add top-k tradeoff summary table

https://github.com/Akk525/jev_eval/issues/41
