# Project state

Snapshot date: 2026-09-23

## Current milestone

M3 — Toolspace Scaling

## Completed issues

- #1–#30 — M0–M2 closed on `main` (including live LLM path).
- #31 Expand catalog to 100 tools — on `main`.
- #32 Harden per-task nested toolspace construction for N=5..100 — on `main`. `SCALING_TOOLSPACE_SIZES`, invalid-N rejection, catalog nesting tests.

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D11). Formal scaling sizes are `{5, 10, 25, 50, 100}`; other positive integers (e.g. N=20) remain constructible. Non-positive / non-integer N throws `ToolspaceError`.

## Known problems

- Live runs cost money and are not part of CI.
- `datasets/v0.1/` still labels the original 20-tool slice; #33 reviews/extends tasks for scaling.
- M5 blocked on real calibration-bearing result directories.
- Fixed N for M4 k-sweep not locked (#39).

## Open questions

- Fixed N for the M4 k-sweep (#39).
- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#33 Validate and extend the dataset for the scaling experiment

https://github.com/Akk525/jev_eval/issues/33
