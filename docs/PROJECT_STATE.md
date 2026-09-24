# Project state

Snapshot date: 2026-09-24

## Current milestone

M3 freeze preparation (**pending approval**). Dress rehearsal passed engineering gate at commit `2a99ed2` (`2026-09-24T053415Z`). Do **not** launch live M3 until freeze review is approved.

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #43 — adaptive `Router` behind the existing interface; run records carry branch/k/escalation.
- #44 — adaptive vs fixed-k eval configs, holdout split, aggregator, mock path.
- #45 — adaptive summary tables (comparison + branch usage; no superiority claim).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

M3 freeze: matrix = baseline / jev_top1 / jev_top5 × N∈{5,10,25,50,100}; `totalLatencyMs` on runner; plan at [m3-freeze.md](m3-freeze.md) / `analysis/m3-freeze/matrix-plan.json`.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D13). Adaptive confidence→k stopped after holdout negative result. M3 drops LLM top-5 from the comparison (archived under `configs/archive/llm-top5-matrix/`). Runner records `totalLatencyMs` (R0 latencies summarized separately).

## Known problems

- Live runs cost money and are not part of CI.
- Tool-executor-only latency remains unavailable (not fabricated).
- Dress rehearsal immutable at `2a99ed2` / `2026-09-24T053415Z`.

## Next recommended action

1. Freeze review approval (see [m3-freeze.md](m3-freeze.md)).
2. Only after approval: `npm run matrix -- --results results` (live).
3. Do not retune adaptive thresholds or re-mine the n=24 holdout.
