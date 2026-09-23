# Project state

Snapshot date: 2026-09-23

## Current milestone

M3 — Toolspace Scaling (gated: #30 closed; next is #31 / #32)

## Completed issues

- #1–#24 — M0 and M1 closed on `main`. Vertical slice: 20 tools, 50 tasks, mocked baseline/Jev, methodology, pricing, Memora adapter.
- #25–#29 — M2 offline path closed on `main`. LLM router, configs (D11), router-only Recall@k, calibration/cost summaries, mocked Jev vs LLM integration.
- #30 Wire the live LLM-routed path through the shared agent — on `main`. Live baseline/Jev/LLM share `createSingleStepAgent`. LLM router uses `createOpenAIRankProvider` with `AGENT_API_KEY`.

## Issue currently being worked on

None.

## Important implementation decisions

Accepted in `docs/DECISIONS.md`:

- D1. Per-task nested toolspaces. `toolspace(task, 5) ⊂ toolspace(task, 10) ⊂ … ⊂ toolspace(task, 100)`. Early distractors are frozen near-misses.
- D2. Routers rank `routingSummary` only. The agent sees full schemas. Registry hash covers summary and near-miss edits.
- D3. MVP aggregate is Execution Success Rate. No LLM judge. End-to-End Task Success is later.
- D4. Full Jev distribution, top-1 probability, and provider confidence are stored separately.
- D5. `runs.jsonl` is the record. Memora is best-effort and cannot fail a run.
- D6. `R0 INFRASTRUCTURE_FAILURE` is excluded from Execution Success Rate and Recall@k. `R1` is a valid decision that missed the required tool.
- D7. Do not tune the benchmark to favor Jev. Post-run method changes get a new version.
- D8. One TypeScript package (Node 20, Zod, Vitest). Native tool calling. Dataset slice is `datasets/v0.1/`.
- D9. Result directories are immutable and resumable. Pricing is versioned.
- D10. M1 pins: agent `openai` / `gpt-5.6-sol` at temperature 0. Jev `typesafe` / `jev-1.13.0` on the official System One API. The alias `gpt-5.6` is not a pin.
- D11. M2 LLM router pin: `openai` / `gpt-5.6-sol`, same id as the agent, so the comparison is routing method not model tier.

Live paths: baseline and LLM need `AGENT_API_KEY`; Jev also needs `TYPESAFE_API_KEY`. Offline `--mock` remains CI. See issue map in git history / GitHub milestones for #31–#54.

## Known problems

- Live runs cost money and are not part of CI.
- M5 is blocked on real calibration-bearing result directories.
- Which fixed N to hold for M4 k-sweep is not locked yet (#39).
- Catalog is still 20 tools; N=100 needs #31.

## Open questions

- Fixed N for the M4 k-sweep (#39).
- Adaptive policy thresholds (#42) after real calibration results.

## Next recommended issue

#31 Expand the deterministic tool catalog toward 100 tools

https://github.com/Akk525/jev_eval/issues/31

(#32 can proceed in parallel once #31’s registry size exists, or start after enough tools land.)
