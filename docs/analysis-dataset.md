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

## M5 skip

While adaptive policy thresholds (#42) are unlocked, `#45` adaptive routing
summary tables are documented as skipped (`m5_adaptive_tables: "skipped"`).
Revisit when adaptive eval dirs exist.

## Attempt fields

Each row carries provenance (`source_directory`, `config_hash`, `git_sha`),
experiment dimensions (`architecture`, `toolspace_size`, `top_k`,
`router_only`), frozen controls, and the attempt metrics needed for later
figures (ESR, Recall@k, tokens, priced cost, latencies, failure codes,
confidence / top-1 probability kept distinct per D4).
