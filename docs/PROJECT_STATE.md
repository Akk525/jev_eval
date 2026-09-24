# Project state

Snapshot date: 2026-09-23

## Current milestone

M4 — Top-k Ablations (configs landed; execution still open)

## Completed issues

- #1–#30 — M0–M2 closed on `main` (including live LLM path).
- #31 Expand catalog to 100 tools — on `main`.
- #32 Harden nested toolspaces for N=5..100 — on `main`.
- #33 Validate and extend the dataset for scaling — on `main`. `datasets/v0.2/tasks.jsonl` (78 tasks); v0.1 kept for slice configs.
- #34 Add N-matrix experiment configurations — on `main`. `configs/matrix/` (15 cells); regenerate via `npm run generate:matrix`.
- #35 Add scaling experiment runner orchestration — on `main`. `npm run matrix` with dry-run, resume manifests, fail-loud (no silent retries).
- #36 Add repetition and statistical aggregation — on `main`. `summary.json` gains `*_stats` + `by_repetition`; `configs/final/` uses `repetitions: 3`.
- #37 Add bounded provider concurrency — on `main`. `concurrency` 1..8 via `mapPool`; default configs stay at 1.
- #38 Add scaling experiment summary tables — on `main`. `npm run summarize` rebuilds architecture × N JSON/CSV from result dirs.
- #39 Add Jev top-k sweep experiment configs — on `main`. `configs/k-sweep/` at N=25, k∈{1,3,5,10} (D12).

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). M4 k-sweep fixes N=25 and varies only Jev `topK`. Summary tables recompute from `runs.jsonl` only.

## Known problems

- Live runs cost money and are not part of CI.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.
- M5 blocked on real calibration-bearing result directories.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#40 Execute and aggregate top-k ablation metrics

https://github.com/Akk525/jev_eval/issues/40
