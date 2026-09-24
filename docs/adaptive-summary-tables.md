# Adaptive routing summary tables (M5 / #45)

Status: **generators ready.** Numbers come only from adaptive-eval result directories.

## Purpose

Machine-readable tables for the adaptive vs fixed-k comparison and per-branch
usage. They report the tradeoff; they do **not** claim adaptive routing is
superior (`decision_rule: null`).

## Inputs

Immutable result directories from `npm run adaptive-eval` (see [adaptive-eval.md](adaptive-eval.md)):

* `baseline-n20`
* `jev-top1-n20`
* `jev-top5-n20`
* `adaptive-n20`

## CLI

```bash
npm run adaptive-eval -- --mock --results /tmp/jev-adaptive-eval
npm run analysis:adaptive -- --results /tmp/jev-adaptive-eval --out analysis/adaptive
```

Writes under `--out` (default `analysis/adaptive/`):

| File | Contents |
|---|---|
| `adaptive-summary.json` | Full artifact: question, note, comparison, branch_usage, held_out_split |
| `adaptive-comparison.csv` | Flat accuracy / cost / latency / escalation columns |
| `adaptive-branch-usage.csv` | high / medium / low counts and frequencies |

## Tables

### Comparison

One row per cell (`baseline`, `jev_top1`, `jev_top5`, `adaptive`):

* ESR, Recall@k, selection accuracy
* priced cost and tokens per attempt
* router / agent latency means
* escalation frequency + mean selected k (adaptive)
* deltas vs `jev_top5` (for reading the tradeoff only)

### Branch usage

Frequency of `high` / `medium` / `low` on the adaptive row, with the policy action
string for each branch.

## Analysis dataset flag

`npm run analysis:dataset` sets `m5_adaptive_tables` to `"present"` when an
adaptive-eval dir is under the results root; otherwise `"skipped"` with a reason.

## Non-goals

* Publication SVG plots (M6 figures stay separate)
* Marketing copy or an automatic “adaptive wins” field
