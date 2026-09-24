# M3 freeze (pre-execution)

Status: **frozen pending approval** — do not launch live M3 until review sign-off.

Dress rehearsal `2026-09-24T053415Z` at commit `2a99ed2` is an immutable
engineering-validation artifact. Do not rerun or modify it.

## Comparison

| Role | Architecture | k |
|---|---|---|
| Primary comparison | baseline | full toolspace (N) |
| Control | Jev top-1 | 1 |
| Treatment | Jev top-5 | 5 |

N ∈ {5, 10, 25, 50, 100}. LLM top-5 is archived at
`configs/archive/llm-top5-matrix/` and is **not** in this matrix.

## Plan artifact

```bash
npm run generate:m3-freeze
npm run matrix -- --validate
npm run matrix -- --dry-run
```

Machine-readable plan: [`analysis/m3-freeze/matrix-plan.json`](../analysis/m3-freeze/matrix-plan.json).

## Locked scientific controls

Shared across all cells (except intended routing / tool-exposure treatment):

- Dataset: `datasets/v0.2/tasks.jsonl` (all tasks)
- Nested toolspaces per D1 / methodology
- Jev: `typesafe` / `jev-1.13.0`
- Agent: `openai` / `gpt-5.6-sol` / `temperature: 0`
- Pricing: `v1`
- Repetitions: `1`
- Concurrency: `1`
- Seed: `0`
- Tracing: `noop`
- Failure taxonomy R0–R6 and quality denominators (R0 out of ESR / Recall@k / selection)
- Latency: component `routerLatencyMs` / `agentLatencyMs` preserved; `totalLatencyMs` is
  runner-path wall clock; summary `total_latency_ms` excludes R0
  (`total_latency_ms_r0` separate); tool-executor-only latency unavailable

## totalLatencyMs

Monotonic (`performance.now`) wall-clock ms from attempt start through router
(when used), agent (when used), synchronous tool execute (when used), and
evaluation — recorded immediately before `runs.jsonl` append. Always present.

For R0 / incomplete attempts: duration until infrastructure failure
classification. Distinguishing fields: `failureCode`, `infrastructureReason`,
`executionExcluded`, `routingExcluded`.
