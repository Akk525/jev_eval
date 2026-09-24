# Plan: Manifest-scoped analysis + publication synthesis

**Date:** 2026-09-24  
**Spec:** [2026-09-24-publication-synthesis-design.md](../specs/2026-09-24-publication-synthesis-design.md)

## Files

| File | Responsibility |
|---|---|
| `src/analysis/manifest-scope.ts` | Load completed cell dirs from `_matrix` / `_k-sweep` / `_adaptive-eval` manifests |
| `src/analysis/paired-uncertainty.ts` | Paired bootstrap + McNemar exact |
| `src/analysis/synthesis.ts` | Build `synthesis.json` + figure JSON from pinned manifests |
| `src/analysis/synthesis-svg.ts` | Render figure JSON → SVG |
| `src/cli/analysis-synthesis.ts` | One-command regenerator |
| CLI updates | `summarize`, `k-sweep` require `--manifest` |

## Tasks

1. **Manifest scope (TDD)** — helper + tests proving multi-epoch roots fail without manifest; with manifest only listed dirs load.
2. **Wire CLIs** — summarize / k-sweep summarize|tradeoff|marginal require `--manifest`.
3. **Paired uncertainty (TDD)** — bootstrap mean Δ; McNemar exact; fixture tests.
4. **Synthesis builder** — M3/M4/adaptive panels; write figure JSON.
5. **SVG renderer** — line/bar/scatter from figure JSON.
6. **Docs freeze** — PROJECT_STATE, DECISIONS D15, TECHNICAL_REPORT, m4-freeze executed.
7. **Regenerate** — `npm run analysis:synthesis`; verify artifacts.
