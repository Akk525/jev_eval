# M4 freeze (executed)

Status: **executed and frozen** at commit `5f9e7c3` / timestamp `2026-09-24T140621Z`.

Live four-cell ablation completed. Raw dirs immutable. Do **not** launch further
live M4 (or other) experiments without a new freeze.

## Ablation

| Cell id | Directory |
|---|---|
| `jev_k1_n100` | `results/2026-09-24T140621Z_jev_n100_k1_5f9e7c3f105d` |
| `jev_k3_n100` | `results/2026-09-24T140621Z_jev_n100_k3_5f9e7c3f105d` |
| `jev_k5_n100` | `results/2026-09-24T140621Z_jev_n100_k5_5f9e7c3f105d` |
| `jev_k10_n100` | `results/2026-09-24T140621Z_jev_n100_k10_5f9e7c3f105d` |

Manifest: `results/_k-sweep/2026-09-24T140621Z.json`  
Plan: [`analysis/m4-freeze/k-sweep-plan.json`](../analysis/m4-freeze/k-sweep-plan.json)  
Live summary: [`analysis/m4-freeze/live-results.json`](../analysis/m4-freeze/live-results.json)

**Treatment:** `topK` only. Fixed N = 100 (D14). Fresh run — M3 k=1/k=5 dirs not reused.  
**No optimal-k claim** (`decision_rule: null`).

## Analysis (manifest-required)

```bash
npm run k-sweep -- --summarize --manifest results/_k-sweep/2026-09-24T140621Z.json
npm run k-sweep -- --tradeoff --manifest results/_k-sweep/2026-09-24T140621Z.json
npm run k-sweep -- --marginal-utility --manifest results/_k-sweep/2026-09-24T140621Z.json
```

Do **not** pass bare `--results results` for analysis (D15).

## Publication synthesis

```bash
npm run analysis:synthesis
```

Regenerates `analysis/synthesis/` from M3 + M4 + adaptive frozen manifests.
