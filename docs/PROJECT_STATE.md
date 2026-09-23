# Project state

Snapshot date: 2026-09-23

## Current milestone

M2 — Routing Benchmark (follow-up). M3–M6 issues are filed; do not start M3 until #30 lands.

## Completed issues

- #1–#24 — M0 and M1 closed on `main`. Vertical slice: 20 tools, 50 tasks, mocked baseline/Jev, methodology, pricing, Memora adapter.
- Live OpenAI agent — on `main`. Native tool calling via Chat Completions. Live CLI path for baseline and Jev.
- #25–#29 — M2 offline path closed on `main`. LLM router, configs (D11), router-only Recall@k, calibration/cost summaries, mocked Jev vs LLM integration.

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

Shared types live in `src/types/`. Live agent path: `createOpenAIChatProvider` + `createSingleStepAgent`. Live Jev path: TypeSafe DecisionProvider + `createJevRouter`. Offline `--mock` supports baseline, Jev, and LLM. Live architecture `llm` is not wired yet (#30).

## Known problems

- Live architecture `llm` is not wired (#30). Blocks M3 start.
- Live runs cost money and are not part of CI.
- M5 is blocked on real calibration-bearing result directories, not only code.
- Which fixed N to hold for M4 k-sweep is not locked yet.
- Adaptive policy thresholds (#42) cannot be chosen until those results exist.

## Open questions

- Fixed N for the M4 k-sweep (must be chosen from completed M3 controls and documented in #39).
- Adaptive policy shape and threshold rule (#42) — held-out methodology required before implementation (#43).
- Whether M6.1 treats missing M5 dirs as skippable or required (issue allows documenting a skip).

## Filed issue map (M2 follow-up + M3–M6)

| Key | Issue | Milestone |
|---|---|---|
| M2F | #30 Wire the live LLM-routed path through the shared agent | M2 |
| M3.1 | #31 Expand the deterministic tool catalog toward 100 tools | M3 |
| M3.2 | #32 Harden per-task nested toolspace construction for N=5..100 | M3 |
| M3.3 | #33 Validate and extend the dataset for the scaling experiment | M3 |
| M3.4 | #34 Add N-matrix experiment configurations | M3 |
| M3.5 | #35 Add scaling experiment runner orchestration | M3 |
| M3.6 | #36 Add repetition and statistical aggregation for end-to-end runs | M3 |
| M3.7 | #37 Add bounded provider concurrency | M3 |
| M3.8 | #38 Add scaling experiment summary tables | M3 |
| M4.1 | #39 Add Jev top-k sweep experiment configs | M4 |
| M4.2 | #40 Execute and aggregate top-k ablation metrics | M4 |
| M4.3 | #41 Add top-k tradeoff summary table | M4 |
| M5.1 | #42 Define adaptive-routing policy from calibration results | M5 |
| M5.2 | #43 Implement the adaptive router behind the Router interface | M5 |
| M5.3 | #44 Evaluate adaptive routing against fixed-k baselines | M5 |
| M5.4 | #45 Add adaptive routing summary tables | M5 |
| M6.1 | #46 Build a normalized analysis dataset from result directories | M6 |
| M6.2 | #47 Generate Figure 1 data and plot (ESR vs N) | M6 |
| M6.3 | #48 Generate cost and token figures vs N | M6 |
| M6.4 | #49 Generate latency figure vs N | M6 |
| M6.5 | #50 Generate routing Recall@k figure | M6 |
| M6.6 | #51 Generate calibration figure for Jev probabilities | M6 |
| M6.7 | #52 Generate failure decomposition figure | M6 |
| M6.8 | #53 Final methodology and reproducibility audit | M6 |
| M6.9 | #54 Publication-ready technical report and README results section | M6 |

## Next recommended issue

#30 Wire the live LLM-routed path through the shared agent.

https://github.com/Akk525/jev_eval/issues/30

Do not begin M3 (#31+) until #30 is closed.
