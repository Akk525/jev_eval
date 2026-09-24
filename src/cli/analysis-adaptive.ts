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
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:adaptive -- [--results <dir>] [--out <dir>]

Generate M5 adaptive routing summary tables from adaptive-eval result directories.
Recomputes from runs.jsonl only. Does not claim adaptive superiority.

--results <dir>  Result root containing adaptive-eval dirs. Default: results.
--out <dir>      Output directory. Default: analysis/adaptive.

Writes:
  adaptive-summary.json
  adaptive-comparison.csv
  adaptive-branch-usage.csv

Examples:
  npm run analysis:adaptive -- --results /tmp/jev-adaptive-eval --out analysis/adaptive
`);
  process.exit(0);
}

try {
  const tables = buildAdaptiveSummaryTables(resolve(values.results));
  const paths = writeAdaptiveSummaryTables(tables, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        comparison_rows: tables.comparison.length,
        branch_rows: tables.branch_usage.length,
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
