# Scaling dress rehearsal

Engineering validation before the full M3 N-matrix. **Not** a scientific
sample — do not optimize thresholds, k, or architectures against its numbers.

## Design

| Axis | Value |
|---|---|
| Architectures | baseline (primary comparison), Jev top-1 (control), Jev top-5 (treatment) |
| Toolspace N | 5, 20, 50 |
| Tasks | first 50 by ascending id from `datasets/v0.2/tasks.jsonl` |
| Repetitions | 1 |
| Manifest | `results/_dress-rehearsal/<timestamp>.json` |

After this passes (nested toolspaces, result isolation, metrics, failure codes,
cost/token accounting, resume), freeze configs and launch M3:

`N ∈ {5,10,25,50,100} × baseline / jev_top1 / jev_top5 × full eval set × planned reps`.

## Commands

```bash
npm run generate:dress-rehearsal   # rewrite configs/dress-rehearsal/*.yaml
npm run dress-rehearsal -- --validate
npm run dress-rehearsal -- --dry-run
npm run dress-rehearsal -- --mock --results /tmp/jev-dress-rehearsal

# Live (costs money). Pass = engineering green light for M3, not a score to chase.
npm run dress-rehearsal -- --results results
```

Resume:

```bash
npm run dress-rehearsal -- --resume --timestamp <id> --results results
```

## Pass criteria (engineering)

1. All 9 cells complete (or fail loud with R0 / infra, not silent drops).
2. Per-cell result dirs are isolated; resume skips completed cells.
3. `runs.jsonl` has nested toolspaces for the same task across N (5 ⊂ 20 ⊂ 50).
4. Failure taxonomy populated (R0–R4 as applicable); cost and token fields present.
5. Manifest records `task_subset` with the frozen 50-task rule.

**Do not** retune adaptive policy or change top-k from this run’s ESR.
