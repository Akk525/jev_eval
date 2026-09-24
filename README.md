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
npm run eval -- --config configs/adaptive-top5-20.yaml --mock
npm run eval -- --config configs/jev-router-only-20.yaml --mock
```

Live slice (needs `AGENT_API_KEY`; Jev also needs `TYPESAFE_API_KEY`; LLM router reuses `AGENT_API_KEY`).
Put them in a repo-root `.env` (see `.env.example`) or export them in the shell — existing shell env wins over `.env`:

```bash
npm run eval -- --config configs/baseline-20.yaml
npm run eval -- --config configs/jev-top5-20.yaml
npm run eval -- --config configs/llm-top5-20.yaml
```

M3 N-matrix configs (baseline / Jev top-1 / Jev top-5 × N ∈ {5,10,25,50,100}) live under `configs/matrix/` and point at `datasets/v0.2/`. Regenerate with `npm run generate:matrix`. Pre-execution freeze plan: `npm run generate:m3-freeze` → `analysis/m3-freeze/matrix-plan.json`. Validate any cell without calling a provider:

```bash
npm run eval -- --validate --config configs/matrix/baseline-n25.yaml
npm run eval -- --validate --config configs/matrix/jev-top1-n100.yaml
npm run eval -- --validate --config configs/matrix/jev-top5-n50.yaml
npm run matrix -- --validate
```

Orchestrate the full matrix (serial cells, resume via `_matrix/<timestamp>.json`, no silent retries). Individual cells remain runnable with `npm run eval`:

```bash
npm run matrix -- --dry-run
npm run matrix -- --validate
npm run matrix -- --mock --results /tmp/jev-matrix
npm run matrix -- --mock --resume --timestamp <id> --results /tmp/jev-matrix
npm run eval -- --config configs/matrix/baseline-n5.yaml --mock
```

LLM top-5 matrix YAMLs are archived at `configs/archive/llm-top5-matrix/` (not part of M3).

**Scaling dress rehearsal** (engineering only — do not optimize against its numbers): 50 tasks × baseline / Jev top-1 / Jev top-5 × N ∈ {5,20,50}. See [docs/dress-rehearsal.md](docs/dress-rehearsal.md).

```bash
npm run dress-rehearsal -- --validate
npm run dress-rehearsal -- --mock --results /tmp/jev-dress-rehearsal
npm run dress-rehearsal -- --results results   # live; costs money
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

M4 Jev top-k sweep (fixed N = 100, k ∈ {1, 3, 5, 10}; only `topK` varies — D14):

```bash
npm run generate:k-sweep
npm run generate:m4-freeze
npm run eval -- --validate --config configs/k-sweep/jev-top1-n100.yaml
npm run k-sweep -- --dry-run
npm run k-sweep -- --mock --results /tmp/jev-ksweep
npm run k-sweep -- --summarize --results /tmp/jev-ksweep --format csv --out analysis/k-sweep.csv
npm run k-sweep -- --tradeoff --results /tmp/jev-ksweep --out analysis/k-tradeoff.json
npm run k-sweep -- --marginal-utility --results /tmp/jev-ksweep --out analysis/m4-freeze/marginal-utility.json
```

See [docs/m4-freeze.md](docs/m4-freeze.md). Do not launch live M4 until freeze review is approved.

Adaptive policy (M5 / #42–#44) — thresholds locked; compare adaptive vs fixed-k on the holdout split:

```bash
npm run check:calibration -- --results results
npm run select:adaptive-thresholds -- --results <jev-result-dir> --write-policy policies/adaptive/v1.json
npm run adaptive-eval -- --mock --results /tmp/jev-adaptive-eval
npm run analysis:adaptive -- --results /tmp/jev-adaptive-eval --out analysis/adaptive
```

See [docs/adaptive-eval.md](docs/adaptive-eval.md) and [docs/adaptive-summary-tables.md](docs/adaptive-summary-tables.md).

No invented benchmark numbers. Conclusions come from result directories only.

## Results

Quantitative results are **pending regenerable result directories**. The harness and
figure pipeline are in place; this README does not publish invented scores.

See the full narrative (six research questions, null/negative findings, citation
table):

* [docs/TECHNICAL_REPORT.md](docs/TECHNICAL_REPORT.md)
* Provenance gate: [docs/reproducibility-audit.md](docs/reproducibility-audit.md)

Regenerate after a results root exists:

```bash
npm run analysis:dataset -- --results <result-root> --out analysis/dataset
npm run analysis:audit -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure1 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure2 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure3 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure4 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure5 -- --dataset analysis/dataset/analysis-dataset.json
npm run analysis:figure6 -- --dataset analysis/dataset/analysis-dataset.json
```

| Question | Current finding | Cite when numbers exist |
|---|---|---|
| Tool selection vs growing N | **Null** | `figure1-esr.json` / `npm run summarize` |
| When pre-routing helps | **Null** | Figures 1–3 under one compatibility key |
| Jev vs baseline/LLM on ESR, cost, tokens, latency | **Null** | Figures 1–3 |
| Failure movement under pre-routing | **Null** | `figure6-failures.json` (R0 separate) |
| k tradeoff | **Null**; no optimal-k claim | `k-tradeoff.json`, `figure4-recall.json` |
| Confidence for adaptive routing | Thresholds locked; summary tables regenerable; live adaptive ESR optional | `policies/adaptive/v1.json`, `analysis/adaptive/adaptive-summary.json` |

The project is not framed as proving that Jev is better than an LLM. Negative results are results.
