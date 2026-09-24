import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { enumerateMatrixCells } from "../config/matrix.js";
import { loadExperimentConfig } from "../config/load.js";
import { loadDotEnv } from "../env/load.js";
import { MatrixOrchestratorError, runMatrix } from "../eval/runner/matrix.js";

loadDotEnv();

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
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run matrix -- [options]

Execute the M3 N-matrix (baseline / Jev top-5 / LLM top-5 × N ∈ {5,10,25,50,100}).
Cells run serially. Each cell still has its own immutable result directory.
Failed cells are recorded and not retried on --resume.

--results <dir>     Result root. Default: results.
--dry-run           Enumerate the plan and exit. Writes no results.
--mock              Offline scripted routers/agent (no live APIs).
--resume            Continue an interrupted matrix run from _matrix/<timestamp>.json.
--timestamp <id>    Shared result timestamp / manifest id. Required to pin a resume target.
--only <config>     Restrict to one or more repo-relative matrix configs (repeatable).
--validate          Load every selected matrix config and exit.

Examples:
  npm run matrix -- --dry-run
  npm run matrix -- --validate
  npm run matrix -- --mock --results /tmp/jev-matrix
  npm run matrix -- --mock --resume --timestamp 2026-09-24T010203Z --results /tmp/jev-matrix
  npm run matrix -- --mock --only configs/matrix/baseline-n5.yaml
  npm run eval -- --config configs/matrix/baseline-n5.yaml --mock
`);
  process.exit(0);
}

try {
  const only = values.only;
  const cells =
    only === undefined || only.length === 0
      ? enumerateMatrixCells()
      : enumerateMatrixCells().filter((cell) => only.includes(cell.relativePath));

  if (only !== undefined && only.length > 0 && cells.length !== only.length) {
    const known = new Set(enumerateMatrixCells().map((c) => c.relativePath));
    const missing = only.filter((path) => !known.has(path));
    throw new Error(`unknown matrix config(s): ${missing.join(", ")}`);
  }

  if (values.validate) {
    for (const cell of cells) {
      const loaded = loadExperimentConfig(resolve(cell.relativePath));
      const k = loaded.config.topK === null ? "all" : String(loaded.config.topK);
      console.log(`validated ${cell.relativePath} n=${loaded.config.toolspaceSize} k=${k}`);
    }
    console.log(`validated ${cells.length} matrix config(s)`);
    process.exit(0);
  }

  const report = await runMatrix({
    resultsRoot: resolve(values.results),
    dryRun: values["dry-run"] === true,
    mock: values.mock === true,
    resume: values.resume === true,
    ...(values.timestamp === undefined ? {} : { timestamp: values.timestamp }),
    ...(only === undefined || only.length === 0 ? {} : { only }),
  });

  for (const cell of report.cells) {
    const dir = cell.directory ?? "-";
    const err = cell.error === null ? "" : ` error=${cell.error}`;
    console.log(`${cell.status}\t${cell.relativePath}\t${dir}${err}`);
  }
  console.log(
    `matrix timestamp=${report.timestamp} dryRun=${report.dryRun} completed=${report.completed} failed=${report.failed} skipped=${report.skipped} pending=${report.pending}`,
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
