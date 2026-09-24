# Project state

Snapshot date: 2026-09-23

## Current milestone

M3 — Toolspace Scaling

## Completed issues

- #1–#30 — M0–M2 closed on `main` (including live LLM path).
- #31 Expand catalog to 100 tools — on `main`.
- #32 Harden nested toolspaces for N=5..100 — on `main`.
- #33 Validate and extend the dataset for scaling — on `main`. `datasets/v0.2/tasks.jsonl` (78 tasks); v0.1 kept for slice configs.

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D11). Scaling dataset is versioned separately from the M1/M2 vertical-slice file. Labels are not model-tuned (D7).

## Known problems

- Live runs cost money and are not part of CI.
- Example configs still point at `datasets/v0.1/`; N-matrix configs (#34) should use v0.2.
- M5 blocked on real calibration-bearing result directories.
- Fixed N for M4 k-sweep not locked (#39).

## Open questions

- Fixed N for the M4 k-sweep (#39).
- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#34 Add N-matrix experiment configurations

https://github.com/Akk525/jev_eval/issues/34
