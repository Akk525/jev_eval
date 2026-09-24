import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildAdaptiveSummaryTables,
  writeAdaptiveSummaryTables,
} from "../analysis/adaptive-summary-tables.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    out: { type: "string", default: "analysis/adaptive" },
    timestamp: { type: "string" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:adaptive -- [--results <dir>] [--out <dir>] [--timestamp <id>]

Generate M5 adaptive routing summary tables from adaptive-eval result directories.
Prefers dirs listed in results/_adaptive-eval/<timestamp>.json so older same-N/k
slice runs are not merged. Recomputes from runs.jsonl only. Does not claim
adaptive superiority.

--results <dir>     Result root containing adaptive-eval dirs. Default: results.
--out <dir>         Output directory. Default: analysis/adaptive.
--timestamp <id>    Use this _adaptive-eval manifest (default: latest).

Writes:
  adaptive-summary.json
  adaptive-comparison.csv
  adaptive-branch-usage.csv

Examples:
  npm run analysis:adaptive -- --results /tmp/jev-adaptive-eval --out analysis/adaptive
  npm run analysis:adaptive -- --results results --timestamp 2026-09-24T045743Z
`);
  process.exit(0);
}

try {
  const tables = buildAdaptiveSummaryTables(resolve(values.results), {
    ...(values.timestamp === undefined ? {} : { timestamp: values.timestamp }),
  });
  const paths = writeAdaptiveSummaryTables(tables, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        source_manifest: tables.source_manifest,
        comparison_rows: tables.comparison.length,
        branch_rows: tables.branch_usage.length,
        attempts: Object.fromEntries(
          tables.comparison.map((row) => [row.cell_id, row.attempts]),
        ),
        escalation_frequency:
          tables.comparison.find((row) => row.cell_id === "adaptive")?.escalation_frequency ?? null,
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
