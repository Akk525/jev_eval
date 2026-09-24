# M4 freeze (pre-execution)

Status: **frozen pending approval** — do not launch live M4 until review sign-off.

M3 live matrix `2026-09-24T055854Z` @ `fc9fb2a` is an immutable scientific
artifact. Do not alter its result directories or mix them into M4 aggregates.

## Ablation

| Cell id | Architecture | N | k |
|---|---|---:|---:|
| `jev_k1_n100` | Jev | 100 | 1 |
| `jev_k3_n100` | Jev | 100 | 3 |
| `jev_k5_n100` | Jev | 100 | 5 |
| `jev_k10_n100` | Jev | 100 | 10 |

**Treatment:** `topK` only. Fixed N = 100 (D14; amends D12).  
**No optimal-k claim** unless a decision rule is versioned before the run. The
tradeoff curve is the result.

## Execution policy (fresh)

All four cells run as a **fresh** ablation under `results/_k-sweep/`.

Immutable M3 `jev-top1-n100` / `jev-top5-n100` directories are **not** reused for
M4 cells, manifests, or aggregates (timestamp/environment consistency). Prefer
one clean M4 run over a mixed reuse strategy.

## Plan artifact

```bash
npm run generate:m4-freeze
npm run k-sweep -- --validate
npm run k-sweep -- --dry-run
```

Machine-readable plan: [`analysis/m4-freeze/k-sweep-plan.json`](../analysis/m4-freeze/k-sweep-plan.json).

## Locked scientific controls (from frozen M3)

Shared across all cells (except intended `topK` treatment):

- Dataset: `datasets/v0.2/tasks.jsonl` (all 78 task IDs)
- 100-tool registry and registry hash
- Per-task distractor ordering / nested toolspaces (D1)
- Routing summaries (same dataset + registry + Jev)
- Jev: `typesafe` / `jev-1.13.0`
- Agent: `openai` / `gpt-5.6-sol` / `temperature: 0`
- Pricing: `v1`
- Repetitions: `1`
- Concurrency: `1`
- Seed: `0`
- Tracing: `noop`
- Failure taxonomy R0–R6 and quality denominators (R0 out of ESR / Recall@k / selection)
- ESR definition unchanged from M3
- Latency: component `routerLatencyMs` / `agentLatencyMs` preserved; `totalLatencyMs` is
  runner-path wall clock; summary `total_latency_ms` excludes R0
  (`total_latency_ms_r0` separate); tool-executor-only latency unavailable

Configs match M3 Jev N=100 cells except `topK`. Prior N=25 YAMLs archived at
`configs/archive/k-sweep-n25/`.

## Primary metrics

- Strict Recall@k
- Lenient Recall@k
- Execution Success Rate
- Selection accuracy
- R0–R6
- Router / agent / total tokens
- Priced cost
- Router / agent / total latency

## Offline analyses (post-run)

```bash
npm run k-sweep -- --summarize --results <m4-root>
npm run k-sweep -- --tradeoff --results <m4-root>
npm run k-sweep -- --marginal-utility --results <m4-root>
```

Marginal routing utility reports adjacent transitions `k=1→3`, `3→5`, `5→10`:

1. Additional tasks whose required tool enters the candidate set (strict R@k miss→hit)
2. Of those, how many become execution successes
3. Previously successful tasks that become failures
4. R1 reduction
5. R2 change
6. Selection-accuracy change
7. Agent-token change
8. Cost change
9. Total-latency change

This separates **additional routing coverage** from **coverage that produces
downstream utility**.

## Persistent R3/R4

Remain in the benchmark. Do not remove or relabel based on M3. Analyze
routing-insensitive behavior separately after the run.
