# Holdout top-1 vs top-5 decomposition

Paired analysis of fixed Jev `top_k=1` and `top_k=5` on the same holdout task
set (odd FNV-1a split from the `2026-09-24T045743Z` adaptive-eval manifest).

**Not** an adaptive-threshold retune. Goal: explain why top-5 differs from
top-1, and whether Jev `confidence` separates correct vs incorrect top-1
routing well enough to justify confidence→k policies.

## Reproduce

```bash
npm run analysis:holdout-top5 -- \
  --top1 results/2026-09-24T045743Z_jev_n20_k1_1f99c847bfc9 \
  --top5 results/2026-09-24T045743Z_jev_n20_k5_1f99c847bfc9 \
  --out analysis/holdout
```

Artifact: `analysis/holdout/holdout-top5-decomposition.json`.

## Headline numbers (n=24)

| Metric | Value |
|---|---:|
| Recall@1 | 0.750 (18/24) |
| Recall@5 | 0.958 (23/24) |
| Top-1 miss ∩ gold in top-5 | 5 |
| Top-1 miss ∩ gold also miss@5 | 1 |
| Agent ESR recovery on those 5 | 2/5 (0.40) |
| Selection accuracy on those 5 | 1/5 (0.20) |

Top-5 execution failures (denom 23): **R1×1, R2×3, R3×1**.
So most residual top-5 misses are **selection (R2)**, not routing (R1).

## Confidence vs top-1 routing correctness

| | Correct (18) | Incorrect (6) |
|---|---:|---:|
| median conf | 1.00 | 0.45 |
| mean conf | 0.92 | 0.61 |
| range | 0.49–1.00 | 0.34–0.98 |

There **is** average separation, but **overlap at the high end**: three of six
routing misses still have conf ≥ 0.66 (0.66, 0.80, 0.98). Under adaptive v1
(`T_high = 0.6`) those stay on the high→k=1 branch — exactly the adaptive
collapse observed on this holdout.

Exploratory score-shape (margin / entropy from Jev `scores`) shows larger
median gaps on this sample than scalar confidence, but two high-margin misses
remain (`task_0039`, `task_0042`). Not promoted to a policy; listed for the
next architecture discussion only.

## Frozen M5 holdout conclusion

> **The holdout supports fixed top-k routing as the next hypothesis to test.
> Increasing k from 1 to 5 primarily improves routing coverage, while residual
> failures shift downstream toward agent selection. Jev confidence is not
> sufficiently reliable at the high-confidence tail to support the current
> adaptive-k policy.**

Do **not** retune `T_low` / `T_high` against these 24 examples. Margin/entropy
stays an exploratory note only — not a new architecture at this n.

**Next information** must come from new scaling runs, not further optimization
on this holdout:

- **Treatment:** Jev top-5  
- **Primary comparison:** baseline (full toolspace)  
- **Control:** Jev top-1 (explains *why* top-5 differs)  
- **Scale:** N ∈ {5, 10, 25, 50, 100}

Primary question: as toolspace grows, does retrieving five candidates preserve
ESR while reducing context, cost, and latency vs exposing the agent to the full
toolspace? Secondary: as N increases, does pre-routing convert failures from
routing/tool-overload into downstream selection (R2) failures?
