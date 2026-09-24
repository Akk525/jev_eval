# Project state

Snapshot date: 2026-09-23

## Current milestone

M6 — Analysis + Publication (**complete** for pipeline / narrative; live numbers pending)

## Completed issues

- #1–#41 — M0–M4 path on `main`.
- #42 — scaffolding only; thresholds not locked (**still open**).
- #46–#53 — analysis dataset, figures 1–6, reproducibility audit.
- #54 — technical report + README Results section (null findings until result dirs).

## Issue currently being worked on

None (landing #54).

## Important implementation decisions

Accepted in `docs/DECISIONS.md` (D1–D12). Publication narrative answers all six research questions with **null** findings where artifacts are absent. No “Jev wins” framing.

## Known problems

- Live runs cost money and are not part of CI.
- **No calibration-bearing / scaling result directories in-repo** → no published curves; M5 still blocked.
- Some slice example configs still point at `datasets/v0.1/`; matrix/k-sweep use v0.2.

## Open questions

- Adaptive policy thresholds (#42) after real calibration results.
- Fill [docs/TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) numeric subsections only from regenerated figure JSON.

## Next recommended action

1. Run matrix / k-sweep (mock or live) into a results root.
2. `analysis:dataset` → `analysis:audit` → figures 1–6.
3. Cite those paths when updating the technical report with numbers.
4. Optionally resume M5 when `check:calibration` passes.

M6 critical path through #54 is closed on `main` for documentation/pipeline. Experimental conclusions await data.
