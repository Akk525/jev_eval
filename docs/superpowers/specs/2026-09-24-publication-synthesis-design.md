# Design: M3+M4+adaptive publication synthesis

**Date:** 2026-09-24  
**Status:** approved  
**Decision:** Approach A — JSON SoT + generated SVG; manifest-only analysis first.

## Goals

1. Fail-closed analysis: require an explicit epoch manifest; never scan `results/` indiscriminately.
2. One deterministic command regenerates the full publication synthesis from three frozen manifests.
3. JSON is canonical; SVG is derived; never raw results → SVG.

## Frozen sources

| Role | Manifest |
|---|---|
| M3 matrix | `results/_matrix/2026-09-24T055854Z.json` |
| M4 k-sweep | `results/_k-sweep/2026-09-24T140621Z.json` |
| Adaptive | `results/_adaptive-eval/2026-09-24T045743Z.json` |

## Dependency

```
Frozen manifests → task-level analysis → synthesis.json → figure JSON → SVG
```

## Uncertainty policy

- Paired bootstrap over the 78 shared tasks (task-sample uncertainty, not run-to-run).
- McNemar exact for predeclared binary success pairs; report discordance table + Δ + CI + p; do not hunt equivalence.
- Cost CI = uncertainty over this task sample; state explicitly in methodology.
- Latency out of headline figures.

## Outputs

`analysis/synthesis/{synthesis.json,synthesis.md,figures/*.json,rendered/*.svg}`

## Non-goals

PNG; new live runs; optimal-k; equivalence claims; independent-proportion tests.
