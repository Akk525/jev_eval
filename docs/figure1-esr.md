# Figure 1 — Execution Success Rate vs N

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure1 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure1
```

## Outputs

| File | Contents |
|---|---|
| `figure1-esr.json` | Series points with ESR + optional repetition CI |
| `figure1-esr.csv` | Same points, tabular |
| `figure1-esr.svg` | Multi-architecture line plot (no external plotting deps) |

## Metric

* **Y:** Execution Success Rate (not Task Success — until E2E exists).
* **X:** `toolspace_size` (number of available tools).
* Denominator excludes R0 / `executionExcluded` (D6).
* Router-only epochs are omitted (ESR is undefined for them).
* Architectures plotted when present: `baseline`, `jev`, `llm`.
* Uncertainty (`ci95_*`) is filled only when ≥2 repetition indexes contribute.

## Provenance

Each point traces to attempts in `analysis-dataset.json` → source result
directories listed on those rows. No interpretive ranking or “winner” claim.
