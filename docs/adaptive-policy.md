# Adaptive routing policy (M5)

Status: **methodology and policy shape locked; numeric thresholds not set.**

Issue #42 forbids shipping adaptive routing merely because a `Router` interface exists. Thresholds must come from real calibration-bearing result directories (M2/M3/M4), not from synthetic placeholders or final-test peeking.

## Research question

Can Jev provider-reported `confidence` allocate candidate context (smaller/larger k) or escalate to another router without hurting Execution Success Rate?

`top1Probability` is never used as a substitute for `confidence` (D4).

## Policy shape (version `adaptive-policy-v0`)

Branches (intended behavior once thresholds exist):

| Branch | Condition (uses `confidence` only) | Action |
|---|---|---|
| `high` | `confidence >= T_high` | Jev top-k with small k (default target k = 1) |
| `medium` | `T_low <= confidence < T_high` | Jev top-k with larger k (default target k = 5, matching M3/M4 default) |
| `low` | `confidence < T_low` | Escalate to LLM router top-k (default k = 5), or full toolspace if escalation is unavailable |

Checked-in stub: `policies/adaptive/v0.pending.json`.

- `thresholds` stays `null` until the checklist below passes.
- `threshold_source` must cite concrete result directories used as the **development / held-out** set.
- Changing branch targets or threshold-selection rules after the first adaptive evaluation run requires a new policy version and a `docs/DECISIONS.md` entry.

## Threshold-selection methodology

Documented **before** any final adaptive evaluation run:

1. **Data.** Only result directories whose `runs.jsonl` lines include non-null Jev `confidence` and scorable primary `recallAtK` (calibration denominator in `summary.json` → `calibration.scored > 0`). Mocked CI scripts that emit a constant confidence are not calibration-bearing for threshold choice.
2. **Split.** Hold out a development set for threshold selection:
   - Prefer a dedicated development result directory recorded before the final adaptive eval config.
   - If only one epoch exists, use tasks with even `taskId` hash for development and odd for a provisional check — never the eventual published adaptive headline set.
3. **Rule (pre-registered).** On the development set only, choose `(T_low, T_high)` to maximize a fixed objective:
   - Primary: development Execution Success Rate under the policy simulated offline from stored `(confidence, required_tools, scores)` — no new labels.
   - Tie-break: lower mean candidate count, then lower priced cost.
   - Grid: `T_low, T_high ∈ {0.1, 0.2, …, 0.9}` with `T_low < T_high`.
4. **Freeze.** Write chosen thresholds into a new file `policies/adaptive/v1.json`, set `threshold_source` to the development directory path(s) + git SHA + config hash, and add DECISIONS entry D13 (or next). Do not retune on the final adaptive eval set (D7).
5. **Negative result.** If development ECE / reliability shows confidence is not predictive of recall hits, record that and do not enable adaptive evaluation. A negative result is a result (BRIEF).

## Checklist (must pass before locking thresholds)

Run:

```bash
npm run check:calibration -- --results <results-root>
```

Required:

- [ ] At least one result directory with Jev architecture and `calibration.scored > 0`
- [ ] Confidence values are not a single constant across scored attempts
- [ ] Cited development dirs are listed by the check and recorded in `threshold_source` when thresholds are locked
- [ ] Final adaptive eval dirs are disjoint from the development set used for thresholds

## Relationship to implementation (#43)

#43 implements the adaptive `Router` only after a non-pending policy file exists with concrete thresholds. Escalations remain explicit in the run record. Malformed escalations stay `R0`.
