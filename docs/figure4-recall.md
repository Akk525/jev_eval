# Figure 4 — Routing Recall@k vs k

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure4 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure4
```

## Outputs

| File | Contents |
|---|---|
| `figure4-recall.json` | Points + series (strict and lenient kept separate) |
| `figure4-recall.csv` | Tabular strict / lenient Recall@k by architecture × N × k |
| `figure4-recall.svg` | Strict = solid; lenient = dashed |

## Metrics

* **Y:** Recall@k. **Strict** uses `required_tools` only. **Lenient** is a
  separate series (never folded into primary).
* **X:** `top_k` (k).
* Routed architectures only (`jev`, `llm`). Baseline omitted.
* k-ablation: multiple k values for the same architecture × N become connected
  series (M4 dirs appear here when present).
* Router-only vs full-agent cells are not mixed; series keys include the mode.
* R0 / `routing_excluded` attempts are out of the recall denominator.

## Provenance

Points come from `recall_at_k` and `lenient_recall_at_k` on analysis-dataset
attempts. No optimal-k claim.
