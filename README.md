# Jev Agent Tool-Routing Eval Harness

As an AI agent's available toolspace grows, can a lightweight decision model pre-route tools more efficiently without sacrificing task completion?

The decision model under test is [Jev](https://openrouter.ai/docs/guides/community/jev) by TypeSafe AI. This repository is an evaluation harness. It is not a claim that Jev is better than an LLM. Conclusions come from reproducible benchmark results. Negative results are results.

## Architectures

The routing mechanism is the variable. The reasoning model, prompt, tool implementations, tasks, and evaluator stay fixed.

| Architecture | What the agent sees |
|---|---|
| Baseline | Full schemas for all N tools in the presented toolspace |
| LLM router | Full schemas for the router's top-k tools |
| Jev router | Full schemas for Jev's top-k tools |

Jev and the LLM router both rank the same frozen `routingSummary` text. Top-k for Jev is a local sort of one Choice distribution. The full distribution, the top-1 probability, and the provider-reported confidence are stored separately.

Toolspaces are per task: the required tools, plus a frozen prefix of difficulty-aware distractors. The same task can run at N = 5, 10, 25, 50, and 100, and the sets nest. Each run records the exact tool list.

## MVP metric

The first benchmark is single-step and deterministic. There is no LLM judge.

**Execution Success Rate** is the fraction of scored runs in which the agent selected a required or acceptable tool, passed the task's argument checks, and the mock tool succeeded.

**End-to-End Task Success** is reserved for later work that adds deterministic outcomes or multi-step completion.

Provider and parse failures are `R0 INFRASTRUCTURE_FAILURE`. They are reported separately and are not counted as routing misses.

## Start here

1. [docs/BRIEF.md](docs/BRIEF.md) — research design
2. [docs/DECISIONS.md](docs/DECISIONS.md) — locked choices
3. [docs/methodology.md](docs/methodology.md) — how success and denominators are defined
4. [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — current milestone and next issue

A new session should read those four, then the open GitHub issue, before changing code.

The first slice is 20 deterministic mock tools and 50 labeled single-step tasks, comparing baseline with Jev top-5. The ~500-task set waits until that slice has exercised the schema.

Offline mocked slice (no live APIs):

```bash
npm test
npm run eval -- --config configs/baseline-20.yaml --mock
npm run eval -- --config configs/jev-top5-20.yaml --mock
npm run eval -- --config configs/llm-top5-20.yaml --mock
npm run eval -- --config configs/jev-router-only-20.yaml --mock
```

Live slice (needs `AGENT_API_KEY`; Jev also needs `TYPESAFE_API_KEY`; LLM router reuses `AGENT_API_KEY`):

```bash
npm run eval -- --config configs/baseline-20.yaml
npm run eval -- --config configs/jev-top5-20.yaml
npm run eval -- --config configs/llm-top5-20.yaml
```

M3 N-matrix configs (baseline / Jev top-5 / LLM top-5 × N ∈ {5,10,25,50,100}) live under `configs/matrix/` and point at `datasets/v0.2/`. Regenerate with `npm run generate:matrix`. Validate any cell without calling a provider:

```bash
npm run eval -- --validate --config configs/matrix/baseline-n25.yaml
npm run eval -- --validate --config configs/matrix/jev-top5-n100.yaml
npm run eval -- --validate --config configs/matrix/llm-top5-n50.yaml
```

Orchestrate the full matrix (serial cells, resume via `_matrix/<timestamp>.json`, no silent retries). Individual cells remain runnable with `npm run eval`:

```bash
npm run matrix -- --dry-run
npm run matrix -- --validate
npm run matrix -- --mock --results /tmp/jev-matrix
npm run matrix -- --mock --resume --timestamp <id> --results /tmp/jev-matrix
npm run eval -- --config configs/matrix/baseline-n5.yaml --mock
```

Final end-to-end slice configs use `repetitions: 3`. `summary.json` reports mean / sample stddev / 95% CI (`*_stats`, and `by_repetition` when multiple reps are present). Raw `runs.jsonl` lines are kept.

```bash
npm run eval -- --config configs/final/baseline-20.yaml --mock
npm run eval -- --config configs/final/jev-top5-20.yaml --mock
npm run eval -- --config configs/final/llm-top5-20.yaml --mock
```

Set `concurrency` (1..8) in a config to bound in-flight provider attempts inside one experiment. Default remains 1. Toolspaces stay deterministic; append order may be completion-ordered.

Rebuild architecture × N tables from result directories (no plots, no claims):

```bash
npm run summarize -- --results /tmp/jev-matrix --format json
npm run summarize -- --results /tmp/jev-matrix --format csv --out analysis/scaling.csv
```

M4 Jev top-k sweep (fixed N = 25, k ∈ {1, 3, 5, 10}; only `topK` varies — D12):

```bash
npm run generate:k-sweep
npm run eval -- --validate --config configs/k-sweep/jev-top1-n25.yaml
npm run k-sweep -- --dry-run
npm run k-sweep -- --mock --results /tmp/jev-ksweep
npm run k-sweep -- --summarize --results /tmp/jev-ksweep --format csv --out analysis/k-sweep.csv
npm run k-sweep -- --tradeoff --results /tmp/jev-ksweep --out analysis/k-tradeoff.json
```

No invented benchmark numbers. Conclusions come from result directories only.
