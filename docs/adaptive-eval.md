# Adaptive vs fixed-k evaluation (M5 / #44)

Status: **harness ready.** Live numbers come only from result directories under a results root.

## Purpose

Compare **adaptive** routing (`policies/adaptive/v1.json`) to:

| Cell | Architecture | k |
|---|---|---|
| `baseline` | full toolspace | — |
| `jev_top1` | fixed Jev | 1 |
| `jev_top5` | fixed Jev | 5 |
| `adaptive` | confidence → branch | 1 / 5 / escalate |

Shared controls: N = 20, `datasets/v0.1/tasks.jsonl`, agent `openai/gpt-5.6-sol`, seed 0 (aligned with the D13 threshold-lock slice).

## Held-out split

#42 locked thresholds on the **even** FNV-1a `taskId` hash development split of
`results/2026-09-24T040823Z_jev_n20_k5_2e9e789ecba3`.

#44 evaluation uses the **complement** (odd hash) so policy construction and
headline eval stay disjoint (D7). The rule is recorded on every
`_adaptive-eval/<timestamp>.json` manifest as `held_out_split`.

## Commands

```bash
npm run adaptive-eval -- --dry-run
npm run adaptive-eval -- --validate
npm run adaptive-eval -- --mock --results /tmp/jev-adaptive-eval
npm run adaptive-eval -- --summarize --results /tmp/jev-adaptive-eval --out analysis/adaptive-eval.json
# live (outside CI):
npm run adaptive-eval -- --results results
```

Configs: `configs/adaptive-eval/*.yaml`.

## Reported metrics

Per cell (from `runs.jsonl` only):

- ESR, Recall@k, selection accuracy
- priced cost, router/agent tokens, latency (mean / p50 / p95)
- failure taxonomy (R0 kept separate)
- **escalation frequency** + branch counts + mean selected k (adaptive row only)

## Non-goals

- Retuning `T_low` / `T_high` from these eval dirs
- Claiming adaptive superiority without citing regenerated table JSON
