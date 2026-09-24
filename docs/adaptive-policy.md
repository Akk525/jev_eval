# Adaptive routing policy (M5)

Status: **thresholds locked in `policies/adaptive/v1.json` (D13).** Methodology remains the pre-registered rule below; do not retune on the final adaptive eval set (D7).

Issue #42 forbids shipping adaptive routing merely because a `Router` interface exists. Thresholds must come from real calibration-bearing result directories (M2/M3/M4), not from synthetic placeholders or final-test peeking.

## Research question

Can Jev provider-reported `confidence` allocate candidate context (smaller/larger k) or escalate to another router without hurting Execution Success Rate?

`top1Probability` is never used as a substitute for `confidence` (D4).

## Policy shape (version `adaptive-policy-v1`)

Branches (uses `confidence` only):

| Branch | Condition | Action |
|---|---|---|
| `high` | `confidence >= T_high` (`T_high = 0.6`) | Jev top-k with small k (k = 1) |
| `medium` | `T_low <= confidence < T_high` (`T_low = 0.5`) | Jev top-k with larger k (k = 5) |
| `low` | `confidence < T_low` | Escalate to LLM router top-k (k = 5), or full toolspace if escalation is unavailable |

Locked file: `policies/adaptive/v1.json`. The earlier stub `policies/adaptive/v0.pending.json` stays as history with `thresholds: null`.

## Threshold-selection methodology

Documented **before** any final adaptive evaluation run:

1. **Data.** Only result directories whose `runs.jsonl` lines include non-null Jev `confidence` and scorable primary `recallAtK` (calibration denominator in `summary.json` → `calibration.scored > 0`). Mocked CI scripts that emit a constant confidence are not calibration-bearing for threshold choice.
2. **Split.** Hold out a development set for threshold selection:
   - Prefer a dedicated development result directory recorded before the final adaptive eval config.
   - If only one epoch exists, use tasks with even `taskId` hash for development and odd for a provisional check — never the eventual published adaptive headline set.
3. **Rule (pre-registered).** On the development set only, choose `(T_low, T_high)` to maximize a fixed objective:
   - Primary: development routing-hit rate under the policy simulated offline from stored `(confidence, required_tools, scores)` — no new labels. (Hit = all required tools appear in the branch's candidate set.)
   - Low / escalate without paired LLM ranks is modeled as **full toolspace coverage** for selection only.
   - Tie-break: lower mean candidate count, then lower `T_low`, then lower `T_high`.
   - Grid: `T_low, T_high ∈ {0.1, 0.2, …, 0.9}` with `T_low < T_high`.
   - Abort (negative result) when the high-confidence third of development does not out-hit the low-confidence third at probe k = 1.
4. **Freeze.** Write chosen thresholds into `policies/adaptive/v1.json`, set `threshold_source` to the development directory path(s) + git SHA + config hash, and add DECISIONS entry D13. Do not retune on the final adaptive eval set (D7).
5. **Negative result.** If development ECE / reliability shows confidence is not predictive of recall hits, record that and do not enable adaptive evaluation. A negative result is a result (BRIEF).

### Locked source (v1)

```bash
npm run check:calibration -- --results results
npm run select:adaptive-thresholds -- \
  --results results/2026-09-24T040823Z_jev_n20_k5_2e9e789ecba3 \
  --write-policy policies/adaptive/v1.json
```

- Development dir: `results/2026-09-24T040823Z_jev_n20_k5_2e9e789ecba3` (Jev N=20 k=5 live slice)
- Split: even FNV-1a `taskId` hash → development (n=26); odd → provisional holdout (n=24)
- Chosen: `T_low = 0.5`, `T_high = 0.6`
- Dev routing-hit rate 1.0; mean candidates ≈ 3.35; holdout hit rate ≈ 0.917
- Predictiveness: low-conf third hit rate 0.625 → high-conf third 1.0 at k=1

## Checklist (must pass before locking thresholds)

Run:

```bash
npm run check:calibration -- --results <results-root>
```

Required:

- [x] At least one result directory with Jev architecture and `calibration.scored > 0`
- [x] Confidence values are not a single constant across scored attempts
- [x] Cited development dirs are listed by the check and recorded in `threshold_source` when thresholds are locked
- [ ] Final adaptive eval dirs are disjoint from the development set used for thresholds (enforced when #44 runs)

## Relationship to implementation (#43)

#43 implements the adaptive `Router` in `src/routers/adaptive/`. Example config: `configs/adaptive-top5-20.yaml`. Escalations are explicit on each run record (`adaptiveBranch`, `adaptiveSelectedK`, `adaptiveEscalationTarget`, split Jev/escalate usage and latency). Malformed or failed escalations stay `R0`. Policy version is recorded as `adaptivePolicyVersion`.
