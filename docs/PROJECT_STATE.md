# Project state

Snapshot date: 2026-09-24

## Current milestone

M5 — Adaptive Routing (thresholds locked; router implementation next)

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — adaptive thresholds locked in `policies/adaptive/v1.json` (D13).
- #46–#54 — M6 analysis pipeline + publication report (null findings until more arches/figures regenerate from live dirs).

## Issue currently being worked on

None (landing #42). Next: #43 adaptive `Router`.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D13). Adaptive branches use provider `confidence` only (D4). OpenAI Chat Completions tool calls send `reasoning_effort: "none"` for `gpt-5.6-sol`.

## Known problems

- Live runs cost money and are not part of CI.
- Only the Jev N=20 k=5 vertical slice has a successful live agent run so far; baseline and LLM-router comparison dirs are still missing for a full three-way paper story.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep use v0.2.
- Local `results/` are gitignored; threshold_source cites a path that must be retained on disk for audit.

## Open questions

- #43–#45 adaptive implementation and eval vs fixed-k.
- Fill [docs/TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) numeric subsections only from regenerated figure JSON once baseline/LLM dirs exist.

## Next recommended action

1. #43 — Implement adaptive router reading `policies/adaptive/v1.json`.
2. Optionally run baseline + LLM live slices for three-way figures.
3. #44 / #45 — Evaluate adaptive against fixed-k and add summary tables (disjoint from the #42 development dir).
