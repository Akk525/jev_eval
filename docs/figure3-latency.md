# Figure 3 — Latency vs N

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure3 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure3
```

## Outputs

| File | Contents |
|---|---|
| `figure3-latency.json` | Router / agent / total latency summaries per architecture × N |
| `figure3-latency.csv` | Same points, tabular (mean, p50, p95, n) |
| `figure3-latency.svg` | Total **p50** lines with **p95** whiskers; open circles mark mean |

## Metrics

* **Y:** wall-clock latency (ms) from stored `router_latency_ms` / `agent_latency_ms`.
* **X:** `toolspace_size`.
* **Distribution:** mean, p50, and p95 via `summarizeLatency` (not mean alone).
* **Total:** per-attempt sum of available router + agent times (null → 0); attempts with both null excluded.
* **Tool latency:** `unavailable` — not stored on attempts; not invented.
* Router-only epochs are omitted.

## Provenance

Points come from latency fields already on analysis-dataset attempts. No
latency-win claims beyond the plotted numbers.
