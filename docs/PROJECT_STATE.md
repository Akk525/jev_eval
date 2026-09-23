# Project state

Snapshot date: 2026-09-23

## Current milestone

M2 — Routing Benchmark

## Completed issues

- #1–#24 — M0 and M1 closed on `main`. Vertical slice: 20 tools, 50 tasks, mocked baseline/Jev, methodology, pricing, Memora adapter.
- Live OpenAI agent — on `main`. Native tool calling via Chat Completions. Live CLI path for baseline and Jev.
- #25 Implement the LLM router — on `main`. Ranks `routingSummary` only via one text completion. Malformed JSON throws (R0). Scores stay null.
- #26 Add LLM-router example configs — on `main`. `configs/llm-top5-20.yaml` pins `openai` / `gpt-5.6-sol` for the router (D11).
- #27 Score router-only Recall@k without the agent — on `main`. `routerOnly` / `--router-only` stops after routing, writes `candidates` and `recallAtK`, excludes execution.

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

Shared types live in `src/types/`. Live agent path: `createOpenAIChatProvider` + `createSingleStepAgent`. Live Jev path: TypeSafe DecisionProvider + `createJevRouter`. Offline path: `--mock`. Catalog tools use `catalogFixture`. Router-only: `configs/jev-router-only-20.yaml` or `--router-only`.

## Known problems

- M3–M6 milestones have no issues yet.
- Live runs cost money and are not part of CI.
- Mocked/live CLI paths for architecture `llm` are not wired yet (#28–#29).

## Open questions

None that block the next M2 issue.

## Next recommended issue

#28 Add calibration and cost summaries for routers.

https://github.com/Akk525/jev_eval/issues/28
