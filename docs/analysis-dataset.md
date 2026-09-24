# Analysis dataset schema

Normalized attempt rows for M6 figure generators. Built from immutable result
directories under `results/` (or an explicit root). Never rewrites `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
```

Writes:

| File | Contents |
|---|---|
| `analysis-dataset.json` | Full artifact: compatibility key, M5 skip note, attempts |
| `attempts.jsonl` | One `NormalizedAttempt` per line |
| `compatibility.json` | Merge key + source dirs + M5 skip note |

## Compatibility (fail loud)

Directories merge only when these scientific controls match:

* `datasetPath` / `datasetVersion`
* `registryHash`
* `pricingVersion`
* agent `provider` / `model` / `temperature`
* `seed`
* `tracing`

There is no separate prompt-version field yet. The frozen agent pin and
registry hash are the stand-ins (see `docs/methodology.md`).

Architecture, `toolspaceSize`, `topK`, `routerOnly`, and router model are **row
dimensions**, not merge keys — baseline / Jev / LLM epochs with the same frozen
controls belong in one dataset.

Mismatch → `AnalysisDatasetError` naming both directories and differing fields.

## M5 adaptive tables

`m5_adaptive_tables` is `"present"` when the results root includes an
adaptive-eval directory (`architecture=adaptive` + `policies/adaptive/v1.json`);
otherwise `"skipped"` with `m5_skip_reason`. Regenerate tables with
`npm run analysis:adaptive` ([adaptive-summary-tables.md](adaptive-summary-tables.md)).

## Attempt fields

Each row carries provenance (`source_directory`, `config_hash`, `git_sha`),
experiment dimensions (`architecture`, `toolspace_size`, `top_k`,
`router_only`), frozen controls, and the attempt metrics needed for later
figures (ESR, Recall@k, tokens, priced cost, latencies, failure codes,
confidence / top-1 probability kept distinct per D4).

## Downstream figures

* Figure 1 (ESR vs N): `docs/figure1-esr.md` — `npm run analysis:figure1`
* Figure 2 (cost + tokens vs N): `docs/figure2-cost-tokens.md` — `npm run analysis:figure2`
* Figure 3 (latency vs N): `docs/figure3-latency.md` — `npm run analysis:figure3`
* Figure 4 (Recall@k vs k): `docs/figure4-recall.md` — `npm run analysis:figure4`
* Figure 5 (Jev calibration): `docs/figure5-calibration.md` — `npm run analysis:figure5`
* Figure 6 (failure decomposition): `docs/figure6-failures.md` — `npm run analysis:figure6`
* Adaptive summary tables (M5 / #45): `docs/adaptive-summary-tables.md` — `npm run analysis:adaptive`
* Reproducibility audit: `docs/reproducibility-audit.md` — `npm run analysis:audit`
