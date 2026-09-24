import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ScalingTableError,
  buildScalingTables,
  scalingTablesToCsv,
  scalingTablesToJson,
} from "../analysis/scaling-tables.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    out: { type: "string" },
    format: { type: "string", default: "json" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run summarize -- [--results <dir>] [--format json|csv] [--out <file>]

Rebuild architecture × N comparison tables from immutable result directories.
Recomputes from runs.jsonl only. No plots. No interpretive claims.

--results <dir>   Result root. Default: results.
--format json|csv Output format. Default: json.
--out <file>      Write to this path. Default: stdout.

Examples:
  npm run summarize -- --results /tmp/jev-matrix --format json
  npm run summarize -- --results /tmp/jev-matrix --format csv --out analysis/scaling.csv
`);
  process.exit(0);
}

try {
  const format = values.format === "csv" ? "csv" : values.format === "json" ? "json" : null;
  if (format === null) throw new ScalingTableError(`unknown format: ${values.format}`);

  const tables = buildScalingTables(resolve(values.results));
  const text = format === "csv" ? scalingTablesToCsv(tables) : scalingTablesToJson(tables);

  if (values.out) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    console.log(`wrote ${tables.rows.length} row(s) to ${outPath}`);
  } else {
    process.stdout.write(text);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
