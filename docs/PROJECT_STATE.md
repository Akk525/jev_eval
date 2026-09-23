# Project state

Snapshot date: 2026-09-23

## Current milestone

M1 — Vertical Slice

## Completed issues

- #1 Record the canonical brief and continuity docs — closed. On `main`.
- #2 Scaffold the TypeScript package — closed. On `main`.
- #3 Define shared domain types — closed. On `main`.
- #4 Validate experiment configuration — on `main`.
- #5 Validate the versioned task dataset — on `main`.
- #6 Implement the tool registry and deterministic executor — on `main`. Two sample tools only.
- #7 Implement pure metric functions — on `main`. The MVP aggregate is Execution Success Rate.
- #8 Implement failure classification — on `main`.
- #9 Implement the result writer and resume checkpoint — on `main`.
- #10 Implement the tracer interface and local capture — on `main`.
- #11 Implement mock providers — on `main`.
- #12 Add the paid-API-free smoke benchmark — on `main`. `npm run eval -- --config configs/smoke.yaml` writes a result directory. Mock run: execution success rate 1, `r0_attempts` 0.
- #13 Add 20 deterministic mock tools — on `main`. Files, email, calendar, and code. `search_files` and `search_email` are mutual near misses. Smoke tools are unchanged.
- #14 Author 50 single-step tasks — on `main`. `datasets/v0.1/tasks.jsonl`. 20 explicit, 15 implicit, 15 ambiguous. Labels were not taken from model output.
- #15 Implement the baseline router — on `main`. Returns the presented toolspace in order. Scores, confidence, and router tokens stay null or zero. It does not cut to k.
- #16 Implement the shared single-step agent — on `main`. One tool-calling turn. The prompt does not name an architecture. Temperature comes from config. A missing tool call is `selectedTool: null`.
- #17 Implement the Jev router adapter — on `main`. One Choice over `routingSummary`, then a local sort to k. Confidence is copied from the provider. More than 255 tools fails before the call. The TypeSafe client strips the API key from the stored payload.
- #18 Implement the task evaluator — on `main`. One attempt gets Recall@k, selection accuracy, and Execution Success from the pure functions. Router `R0` is excluded from both rates. `R1` is an execution miss.
- #19 Implement the experiment runner — on `main`. Baseline and Jev share one path. Each run stores the ordered toolspace and the Jev distribution. A router failure skips the agent and still appends. Resume skips completed tasks.
- #20 Add the CLI and example configs — on `main`. `configs/baseline-20.yaml` and `configs/jev-top5-20.yaml`. `--validate` loads them and does not call a provider.

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

Shared types live in `src/types/`. `RouteDecision.scores`, `top1Probability`, and `confidence` are separate fields. The smoke path still uses five separate mock tools. The benchmark catalog is `createCatalogRegistry()`: 20 tools. Dataset v0.1 has 50 single-step tasks. `required_tools` is primary Recall@k. `acceptable_tools` is execution success and lenient recall.

## Known problems

- M2–M6 milestones have no issues yet. File them after the 50-task slice, not before.

## Open questions

- Pricing amounts in `pricing/v1.json` have to be copied from the provider page at the time #21 is implemented, then frozen. Agent price is OpenAI `gpt-5.6-sol`. Jev price is the TypeSafe page for `jev-1.13.0`.

## Next recommended issue

#21 Add versioned pricing.

https://github.com/Akk525/jev_eval/issues/21
