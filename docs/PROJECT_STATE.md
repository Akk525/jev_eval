# Project state

Snapshot date: 2026-09-24

## Current milestone

M5 — Adaptive Routing (**complete** for harness + summary tables; live headline numbers optional)

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #43 — adaptive `Router` behind the existing interface; run records carry branch/k/escalation.
- #44 — adaptive vs fixed-k eval configs, holdout split, aggregator, mock path.
- #45 — adaptive summary tables (comparison + branch usage; no superiority claim).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

None (landing #45). M5 critical path through #45 is closed on `main`.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D13). Adaptive branches use provider `confidence` only (D4). #44 holdout = odd FNV-1a `taskId` hash (complement of #42 development). OpenAI Chat Completions tool calls send `reasoning_effort: "none"` for `gpt-5.6-sol`.

## Known problems

- Live runs cost money and are not part of CI.
- Only the Jev N=20 k=5 vertical slice has a successful live agent run so far; baseline and LLM-router comparison dirs are still missing for a full three-way paper story.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep use v0.2.
- Local `results/` are gitignored; threshold_source cites a path that must be retained on disk for audit.

## Open questions

- Fill [docs/TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) numeric subsections only from regenerated figure / adaptive-summary JSON once live dirs exist.

## Next recommended action

1. Optionally run `npm run adaptive-eval -- --results results` then `npm run analysis:adaptive`.
2. Optionally run baseline + LLM live slices for three-way figures 1–6.
3. Regenerate TECHNICAL_REPORT numeric subsections from artifact JSON only.
