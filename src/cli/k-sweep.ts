import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildKSweepTables,
  kSweepTablesToCsv,
  kSweepTablesToJson,
} from "../analysis/k-sweep-tables.js";
import { enumerateKSweepCells } from "../config/k-sweep.js";
import { loadExperimentConfig } from "../config/load.js";
import { MatrixOrchestratorError } from "../eval/runner/matrix.js";
import { runKSweep } from "../eval/runner/k-sweep.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    help: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    mock: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
    timestamp: { type: "string" },
    only: { type: "string", multiple: true },
    validate: { type: "boolean", default: false },
    summarize: { type: "boolean", default: false },
    format: { type: "string", default: "json" },
    out: { type: "string" },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run k-sweep -- [options]

Execute the M4 Jev top-k sweep (k ∈ {1, 3, 5, 10} at N = 25) or aggregate its result dirs.
Cells run serially. Each cell keeps its own immutable result directory.
Manifests live under <results>/_k-sweep/.

--results <dir>     Result root. Default: results.
--dry-run           Enumerate the plan and exit.
--mock              Offline scripted routers/agent (CI-safe).
--resume            Continue an interrupted k-sweep from _k-sweep/<timestamp>.json.
--timestamp <id>    Shared result timestamp / manifest id.
--only <config>     Restrict to one or more repo-relative k-sweep configs.
--validate          Load every selected k-sweep config and exit.
--summarize         Rebuild per-k aggregates from result dirs (no new runs).
--format json|csv   Summarize output format. Default: json.
--out <file>        Write summarize output to this path (default: stdout).

Examples:
  npm run k-sweep -- --dry-run
  npm run k-sweep -- --validate
  npm run k-sweep -- --mock --results /tmp/jev-ksweep
  npm run k-sweep -- --summarize --results /tmp/jev-ksweep --format csv --out analysis/k-sweep.csv
`);
  process.exit(0);
}

try {
  const only = values.only;
  const cells =
    only === undefined || only.length === 0
      ? enumerateKSweepCells()
      : enumerateKSweepCells().filter((cell) => only.includes(cell.relativePath));

  if (only !== undefined && only.length > 0 && cells.length !== only.length) {
    const known = new Set(enumerateKSweepCells().map((c) => c.relativePath));
    const missing = only.filter((path) => !known.has(path));
    throw new Error(`unknown k-sweep config(s): ${missing.join(", ")}`);
  }

  if (values.validate) {
    for (const cell of cells) {
      const loaded = loadExperimentConfig(resolve(cell.relativePath));
      console.log(`validated ${cell.relativePath} n=${loaded.config.toolspaceSize} k=${loaded.config.topK}`);
    }
    console.log(`validated ${cells.length} k-sweep config(s)`);
    process.exit(0);
  }

  if (values.summarize) {
    const format = values.format === "csv" ? "csv" : values.format === "json" ? "json" : null;
    if (format === null) throw new Error(`unknown format: ${values.format}`);
    const tables = buildKSweepTables(resolve(values.results));
    const text = format === "csv" ? kSweepTablesToCsv(tables) : kSweepTablesToJson(tables);
    if (values.out) {
      const outPath = resolve(values.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, text);
      console.log(`wrote ${tables.rows.length} row(s) to ${outPath}`);
    } else {
      process.stdout.write(text);
    }
    process.exit(0);
  }

  const report = await runKSweep({
    resultsRoot: resolve(values.results),
    dryRun: values["dry-run"] === true,
    mock: values.mock === true,
    resume: values.resume === true,
    cells,
    ...(values.timestamp === undefined ? {} : { timestamp: values.timestamp }),
    ...(only === undefined || only.length === 0 ? {} : { only }),
  });

  for (const cell of report.cells) {
    const dir = cell.directory ?? "-";
    const err = cell.error === null ? "" : ` error=${cell.error}`;
    console.log(`${cell.status}\t${cell.relativePath}\t${dir}${err}`);
  }
  console.log(
    `k-sweep timestamp=${report.timestamp} dryRun=${report.dryRun} completed=${report.completed} failed=${report.failed} skipped=${report.skipped} pending=${report.pending}`,
  );
  if (report.manifestPath) console.log(`manifest ${report.manifestPath}`);
} catch (error) {
  if (error instanceof MatrixOrchestratorError && error.report) {
    for (const cell of error.report.cells) {
      const dir = cell.directory ?? "-";
      const err = cell.error === null ? "" : ` error=${cell.error}`;
      console.log(`${cell.status}\t${cell.relativePath}\t${dir}${err}`);
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
