# Project state

Snapshot date: 2026-09-23

## Current milestone

M3 — Toolspace Scaling

## Completed issues

- #1–#24 — M0 and M1 closed on `main`.
- #25–#30 — M2 closed on `main`, including live LLM path through the shared agent.
- #31 Expand the deterministic tool catalog toward 100 tools — on `main`. Eight domains, 100 tools, fixtures, interleaved `CATALOG_TAIL`.

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D11). Live paths share `createSingleStepAgent`. Catalog registry hash covers definitions, summaries, near-misses, and the global tail.

## Known problems

- Live runs cost money and are not part of CI.
- `datasets/v0.1/` still labels the original 20-tool slice; #33 reviews/extends tasks for scaling.
- M5 blocked on real calibration-bearing result directories.
- Fixed N for M4 k-sweep not locked (#39).

## Open questions

- Fixed N for the M4 k-sweep (#39).
- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#32 Harden per-task nested toolspace construction for N=5..100

https://github.com/Akk525/jev_eval/issues/32
