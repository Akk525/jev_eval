import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildAnalysisDataset, writeAnalysisDataset } from "../analysis/dataset.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    out: { type: "string", default: "analysis/dataset" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:dataset -- [--results <dir>] [--out <dir>]

Build one normalized analysis dataset from immutable result directories.
Does not rewrite runs.jsonl. Fails loud on scientific-control mismatches.
Documents M5 adaptive-table skip while #42/#45 remain deferred.

--results <dir>   Result root. Default: results.
--out <dir>       Output directory. Default: analysis/dataset.

Writes:
  analysis-dataset.json  Full dataset (compatibility + attempts)
  attempts.jsonl         One normalized attempt per line
  compatibility.json     Merge key + M5 skip note

Examples:
  npm run analysis:dataset -- --results /tmp/jev-matrix --out analysis/dataset
`);
  process.exit(0);
}

try {
  const resultsRoot = resolve(values.results);
  const outDir = resolve(values.out);
  const dataset = buildAnalysisDataset(resultsRoot);
  const paths = writeAnalysisDataset(dataset, outDir);
  console.log(
    JSON.stringify(
      {
        attempt_count: dataset.attempt_count,
        source_directories: dataset.source_directories.length,
        m5_adaptive_tables: dataset.m5_adaptive_tables,
        compatibility: dataset.compatibility,
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
