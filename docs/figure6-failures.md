# Figure 6 — Failure decomposition vs N

Regenerates from the **normalized analysis dataset alone** (`#46`). Does not
read or rewrite `runs.jsonl`.

## CLI

```bash
npm run analysis:dataset -- --results <dir> --out analysis/dataset
npm run analysis:figure6 -- --dataset analysis/dataset/analysis-dataset.json --out analysis/figures/figure6
```

## Outputs

| File | Contents |
|---|---|
| `figure6-failures.json` | Per architecture × N counts/rates for R0–R6 + none |
| `figure6-failures.csv` | Same points, tabular |
| `figure6-failures.svg` | Scientific stack (R1–R6 + none) + **R0 rate as a separate dashed line** |

## Metrics

* Counts come from `failure_code` on analysis-dataset attempts.
* Rates are shares of **all** attempts in the cell.
* `infrastructure_failure_rate` = R0 share (D6).
* `scientific_failure_rate` = (R1+…+R6) share — R0 is never folded into R1.
* R5/R6 appear in `active_codes` / plot stacks only when observed.
* Router-only vs full-agent cells are not mixed.

## Provenance

No relabeling of infrastructure as routing failure. No interpretive ranking.
