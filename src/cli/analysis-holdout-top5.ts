import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildHoldoutTop5Decomposition,
  writeHoldoutTop5Decomposition,
} from "../analysis/holdout-top5-decomposition.js";

const { values } = parseArgs({
  options: {
    top1: { type: "string" },
    top5: { type: "string" },
    out: { type: "string", default: "analysis/holdout" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help || !values.top1 || !values.top5) {
  console.log(`Usage: npm run analysis:holdout-top5 -- --top1 <dir> --top5 <dir> [--out <dir>]

Decompose paired Jev top-1 vs top-5 holdout runs:
  Recall@1 vs Recall@5, recovery when gold enters at k=5,
  top-5 R1 vs R2 failures, confidence (± score-shape) by top-1 routing hit/miss.

Does not retune adaptive thresholds.

Writes:
  holdout-top5-decomposition.json

Examples:
  npm run analysis:holdout-top5 -- \\
    --top1 results/2026-09-24T045743Z_jev_n20_k1_1f99c847bfc9 \\
    --top5 results/2026-09-24T045743Z_jev_n20_k5_1f99c847bfc9
`);
  process.exit(values.help ? 0 : 1);
}

try {
  const data = buildHoldoutTop5Decomposition(resolve(values.top1), resolve(values.top5));
  const paths = writeHoldoutTop5Decomposition(data, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        task_count: data.source.task_count,
        recall_at_1: data.recall.recall_at_1,
        recall_at_5: data.recall.recall_at_5,
        recoverable: data.recovery.recoverable_routing_misses,
        execution_recovery_rate: data.recovery.execution_recovery_rate,
        top5_failures_by_code: data.top5_failures.by_code,
        conf_median_correct: data.confidence_by_top1_routing.correct.median,
        conf_median_incorrect: data.confidence_by_top1_routing.incorrect.median,
        wrote: paths,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
