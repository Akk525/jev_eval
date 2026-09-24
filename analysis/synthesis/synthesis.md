# Publication synthesis (M3 + M4 + adaptive)

Status: regenerable offline artifact. **No optimal-k. No equivalence claim.**

## Sources

- M3: `/Users/aditya/Projects/jev_eval/results/_matrix/2026-09-24T055854Z.json`
- M4: `/Users/aditya/Projects/jev_eval/results/_k-sweep/2026-09-24T140621Z.json`
- Adaptive: `/Users/aditya/Projects/jev_eval/results/_adaptive-eval/2026-09-24T045743Z.json`

## Dependency

```text
Frozen manifests → task-level analysis → synthesis.json → figure JSON → SVG
```

## Methodology notes

- Paired bootstrap resamples the shared task IDs with replacement. Intervals estimate uncertainty over this benchmark task sample, not provider/run-to-run variance.
- Exact two-sided McNemar on discordant success/failure pairs only. Reported subordinate to the observed Δ and discordance table; not used to claim equivalence.
- Paired bootstrap across the 78 benchmark tasks estimates uncertainty over this task sample, not provider/run-to-run variance. Much of cost variation is mechanically task-dependent token usage.
- Latency omitted from headline synthesis figures; M3↔M4 showed material epoch variation.

## Headline paired comparison (M3 N=100 baseline vs top-5)

| Quantity | Value |
|---|---|
| Observed ΔESR (top-5 − baseline) | -0.0128 |
| Paired bootstrap 95% CI | [-0.1026, 0.0641] |
| Discordant: baseline-only / top5-only | 6 / 5 |
| Both success / both failure | 54 / 13 |
| McNemar exact two-sided p | 1.0000 |

> Observed ΔESR is small; discordances are nearly balanced; uncertainty is too large for an equivalence claim.

## Figures

JSON under `figures/`; SVG under `rendered/`. JSON is canonical.

- `esr-vs-n`
- `cost-vs-n`
- `agent-tokens-vs-n`
- `k-ablation`
- `failure-decomposition`
- `cost-esr-frontier`
- `reproducibility`
- `adaptive-calibration`

Generated: 2026-09-24T14:33:25.433Z

