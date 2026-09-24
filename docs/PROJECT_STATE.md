# Project state

Snapshot date: 2026-09-24

## Current milestone

M4 freeze preparation (pre-execution). N=100, k∈{1,3,5,10}, fresh four-cell run (D14).
Do **not** launch live M4 until freeze review is approved.

M3 live matrix **complete** (`2026-09-24T055854Z` @ `fc9fb2a`) — immutable.
Paired scaling analysis accepted.

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #43 — adaptive `Router` behind the existing interface; run records carry branch/k/escalation.
- #44 — adaptive vs fixed-k eval configs, holdout split, aggregator, mock path.
- #45 — adaptive summary tables (comparison + branch usage; no superiority claim).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

M4 freeze: Jev k-ablation at N=100 with cells `jev_k1_n100` / `jev_k3_n100` /
`jev_k5_n100` / `jev_k10_n100`. Plan at [m4-freeze.md](m4-freeze.md) /
`analysis/m4-freeze/k-sweep-plan.json`. Fresh execution only — M3 k=1/k=5 dirs not reused.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D14). Adaptive confidence→k stopped after holdout negative result. M3 drops LLM top-5 from the comparison (archived under `configs/archive/llm-top5-matrix/`). Runner records `totalLatencyMs` (R0 latencies summarized separately). D14 amends D12: M4 fixed N = 100.

## Known problems

- Live runs cost money and are not part of CI.
- Tool-executor-only latency remains unavailable (not fabricated).
- Dress rehearsal immutable at `2a99ed2` / `2026-09-24T053415Z`.

## Next recommended action

1. Freeze-review M4 package ([m4-freeze.md](m4-freeze.md)).
2. After approval: launch `npm run k-sweep` (live, not mock).
3. Post-run: summarize, tradeoff, marginal routing utility — no optimal-k claim.
