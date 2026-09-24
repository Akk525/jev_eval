# Figure 5 — Jev calibration (confidence vs top-1)

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure5 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure5
```

## Outputs

| File | Contents |
|---|---|
| `figure5-calibration.json` | Separate `confidence` and `top1_probability` calibration summaries |
| `figure5-calibration.csv` | Bucket rows tagged by series |
| `figure5-calibration.svg` | Reliability diagram (confidence solid, top-1 dashed) |

## Metrics

* **Jev only.** Other architectures are ignored.
* **Hit:** primary `Recall@k === 1`.
* **Confidence series:** provider `confidence` vs hit. Missing confidence → out.
* **Top-1 series:** `top1_probability` vs hit. Missing top-1 → out.
* **Never combined** into one invented score (D4).
* **ECE** uses the same fixed buckets as `summary.json` / `calibrateConfidence`.

## Provenance

Uses `calibrateProbabilities` shared with the aggregate calibration path. No
adaptive-policy claims.
