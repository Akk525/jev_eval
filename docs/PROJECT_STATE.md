# Project state

Snapshot date: 2026-09-23

## Current milestone

M5 — Adaptive Routing (blocked on calibration data)

## Completed issues

- #1–#41 — M0–M4 path on `main` through the top-k tradeoff table.

## Issue currently being worked on

#42 Define adaptive-routing policy from calibration results — **in progress / blocked on data**.

Methodology + policy stub + checklist landed (`docs/adaptive-policy.md`, `policies/adaptive/v0.pending.json`, `npm run check:calibration`). Numeric thresholds are **not** locked: there are no calibration-bearing result directories in-repo yet.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Adaptive thresholds must cite a development/held-out source (D7). Confidence ≠ top-1 probability (D4).

## Known problems

- Live runs cost money and are not part of CI.
- **No result directories with varying Jev confidence** → cannot finish #42 or start #43.
- Slice example configs still point at `datasets/v0.1/`; matrix and k-sweep configs use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended action

1. Run a live Jev slice that writes calibration-bearing epochs, e.g.:
   `npm run eval -- --config configs/jev-top5-20.yaml` (needs `AGENT_API_KEY` + `TYPESAFE_API_KEY`)
2. `npm run check:calibration -- --results results`
3. Lock thresholds into `policies/adaptive/v1.json` + DECISIONS, then close #42 and start #43.

https://github.com/Akk525/jev_eval/issues/42
