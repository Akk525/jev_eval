# Project state

Snapshot date: 2026-09-23

## Current milestone

M0 — Harness Foundation

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

Shared types live in `src/types/`. `RouteDecision.scores`, `top1Probability`, and `confidence` are separate fields. Config, dataset, registry, metrics, failure codes, result directories, the noop tracer, and mock providers are in place. The registry has two sample tools, not the 20-tool catalog. `npm run eval` is still the not-implemented stub.

## Known problems

- M2–M6 milestones have no issues yet. File them after the 50-task slice, not before.

## Open questions

- Which pinned agent model and which Jev access path (OpenRouter `typesafe/jev-1.13` or direct TypeSafe) go in the M1 configs. Needed before #20 and #21.
- Pricing amounts in `pricing/v1.json` have to be copied from the provider page at the time #21 is implemented, then frozen.

## Next recommended issue

#12 Add the paid-API-free smoke benchmark.

https://github.com/Akk525/jev_eval/issues/12
