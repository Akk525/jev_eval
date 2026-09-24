# Project state

Snapshot date: 2026-09-24

## Current milestone

**Publication checkpoint `ed3dd18` — experimental machinery frozen.**

Do **not** modify the benchmark, launch live runs, retune k, or fit adaptive
policies unless a write-up exposes a separately preregistered follow-up.

Next work is narrative only: polish [`docs/TECHNICAL_REPORT.md`](TECHNICAL_REPORT.md)
from [`analysis/synthesis/`](../analysis/synthesis/). Regenerate numbers solely via:

```bash
npm run analysis:synthesis
```

## Thesis (locked for the write-up)

Pre-routing does not simply make large toolspaces “work.” Large toolspaces
remained usable here. Pre-routing changes **economics and failure structure**:
it keeps expensive agent context nearly constant as capability space grows,
while trading routing coverage against downstream selection difficulty.

The systems question is controlling how much of the capability space reaches
the expensive reasoning model.

## Frozen checkpoints

| Role | ID |
|---|---|
| Publication / analysis SoT | **`ed3dd18`** |
| M3 live matrix | `2026-09-24T055854Z` @ `fc9fb2a` |
| M4 live k-sweep | `2026-09-24T140621Z` @ `5f9e7c3` |
| Adaptive holdout | `2026-09-24T045743Z` |

## Completed

- M0–M6 harness, figures pipeline, adaptive path (negative on confidence→k).
- M3 scaling + paired analysis; M4 k-ablation; D15 manifest-scoped analysis.
- Synthesis JSON→SVG publication pack.

## Next recommended action

1. Iterate the technical report / paper draft only.
2. Cite `analysis/synthesis/` paths; do not invent numbers.
3. No new experiments without a new freeze decision.
