# Project state

Snapshot date: 2026-09-24

## Current milestone

M5 frozen (holdout negative on confidence→k). **Next:** scaling dress rehearsal, then full M3 matrix. No further adaptive-policy work.

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #43 — adaptive `Router` behind the existing interface; run records carry branch/k/escalation.
- #44 — adaptive vs fixed-k eval configs, holdout split, aggregator, mock path.
- #45 — adaptive summary tables (comparison + branch usage; no superiority claim).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

Scaling dress rehearsal ([dress-rehearsal.md](dress-rehearsal.md)): 50 tasks × N∈{5,20,50} × baseline / jev_top1 / jev_top5 × 1 rep — engineering validation only.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D13). Adaptive branches use provider `confidence` only (D4). #44 holdout = odd FNV-1a `taskId` hash (complement of #42 development). OpenAI Chat Completions tool calls send `reasoning_effort: "none"` for `gpt-5.6-sol`. Adaptive summary tables prefer `_adaptive-eval` manifests so older same-N/k dirs are not merged. M5 holdout conclusion frozen in [holdout-top5-decomposition.md](holdout-top5-decomposition.md).

## Known problems

- Live runs cost money and are not part of CI.
- First adaptive holdout (`2026-09-24T045743Z`, n=24/cell): adaptive collapsed to high→k=1 (0 escalations); confidence insufficiently discriminative for the v1 policy — **stop retuning thresholds**.
- n=24 is too small to claim top-5 accuracy > baseline; direction favors studying fixed top-5 at larger N.
- Checked-in `configs/matrix/` still uses LLM top-5 rather than Jev top-1 control; full M3 launch should align arches to baseline / jev_top1 / jev_top5 after dress rehearsal passes.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep/dress-rehearsal use v0.2.
- Local `results/` are gitignored; threshold_source cites a path that must be retained on disk for audit.

## Open questions

- Does score-shape (margin / entropy) separate top-1 routing errors better than scalar confidence on a larger sample? Exploratory only — not a new policy yet.
- Fill [docs/TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) numeric subsections only from regenerated figure / adaptive-summary / holdout-decomposition JSON.

## Next recommended action

1. Run **dress rehearsal** (`npm run dress-rehearsal`) — mock first, then live. Treat as engineering pass/fail only (nested toolspaces, isolation, metrics, failures, cost/tokens, resume). **Do not** optimize against its ESR.
2. After green: freeze configs; launch M3 matrix `N ∈ {5,10,25,50,100} × baseline / jev_top1 / jev_top5 × full eval set × planned reps` (update `configs/matrix/` to include top-1 control if still LLM-shaped).
3. Do **not** retune adaptive `T_low`/`T_high` or re-mine the n=24 holdout.
