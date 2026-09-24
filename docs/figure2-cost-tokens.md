# Figure 2 — Cost and tokens vs N

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure2 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure2
```

## Outputs

| File | Contents |
|---|---|
| `figure2-cost.json` / `.csv` / `.svg` | Priced cost/task vs N by architecture |
| `figure2-tokens.json` / `.csv` / `.svg` | Tokens/task vs N with router vs agent series |

## Metrics

* **Cost Y:** mean `priced_cost_usd` per attempt (pinned `pricing_version`).
* **Provider-reported cost** is stored on cost points for audit only — never
  substituted for priced cost on the plot.
* **Token Y:** tokens per task. Plot series are `{architecture}-router`
  (dashed, when router tokens > 0) and `{architecture}-agent` (solid).
* **X:** `toolspace_size`.
* Router-only epochs are omitted (same full-agent scope as Figure 1).

## Provenance

Points come from token counts and priced costs already stored on analysis
dataset attempts. No pricing-table edits. No interpretive ranking.
