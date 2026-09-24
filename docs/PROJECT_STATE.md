# Project state

Snapshot date: 2026-09-24

## Current milestone

**Paper / report construction.** Live evidence frozen. No further live experiments
without a new freeze. Regenerate publication artifacts with:

```bash
npm run analysis:synthesis
```

## Frozen live epochs

| Epoch | Manifest | Commit |
|---|---|---|
| M3 matrix | `results/_matrix/2026-09-24T055854Z.json` | `fc9fb2a` |
| M4 k-sweep | `results/_k-sweep/2026-09-24T140621Z.json` | `5f9e7c3` |
| Adaptive holdout | `results/_adaptive-eval/2026-09-24T045743Z.json` | (see adaptive summary) |

Synthesis SoT: [`analysis/synthesis/`](../analysis/synthesis/) (JSON canonical; SVG derived).

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42–#45 — adaptive thresholds, router, eval, summary tables; holdout negative on confidence→k.
- #46–#54 — M6 analysis pipeline + publication report scaffolding.
- M3 live + paired scaling analysis accepted.
- M4 live k-ablation complete (`2026-09-24T140621Z`); fresh four cells; no optimal-k.

## Issue currently being worked on

Publication synthesis + paired uncertainty (D15). Manifest-scoped analysis required.

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D15). D14: M4 N=100. D15: fail-closed `--manifest`
for offline aggregates; synthesis is the regenerable paper evidence pack.

## Known problems

- Live runs cost money and are not part of CI.
- Tool-executor-only latency remains unavailable (not fabricated).
- Latency evidence is weaker than cost/token evidence across epochs — omitted from headline synthesis figures.

## Next recommended action

1. Review `analysis/synthesis/synthesis.md` and figure SVGs.
2. Update TECHNICAL_REPORT claims only by citing synthesis / figure JSON paths.
3. Do **not** launch new live runs or retune k/thresholds.
