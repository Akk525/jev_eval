#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { enumerateDressRehearsalCells } from "../config/dress-rehearsal.js";
import { loadExperimentConfig } from "../config/load.js";
import { loadDotEnv } from "../env/load.js";
import { MatrixOrchestratorError } from "../eval/runner/matrix.js";
import { runDressRehearsal } from "../eval/runner/dress-rehearsal.js";

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
  console.log(`Usage: npm run dress-rehearsal -- [options]

Engineering validation before the full M3 scaling matrix.
Cells: baseline / Jev top-1 / Jev top-5 × N ∈ {5, 20, 50}
Tasks: first 50 by ascending id from datasets/v0.2 (frozen subset)
Repetitions: 1

Do NOT optimize thresholds or architectures against these numbers.
Once the rehearsal passes (nested toolspaces, isolation, metrics, failures,
cost/tokens, resume), freeze configs and run the full M3 matrix.

--results <dir>     Result root. Default: results.
--dry-run           Enumerate the plan and exit.
--mock              Offline scripted routers/agent (CI-safe).
--resume            Continue from _dress-rehearsal/<timestamp>.json.
--timestamp <id>    Shared result timestamp / manifest id.
--only <config>     Restrict to one or more repo-relative configs.
--validate          Load every selected config and exit.

Examples:
  npm run dress-rehearsal -- --dry-run
  npm run dress-rehearsal -- --validate
  npm run dress-rehearsal -- --mock --results /tmp/jev-dress-rehearsal
  npm run dress-rehearsal -- --mock --resume --timestamp <id> --results /tmp/jev-dress-rehearsal
`);
  process.exit(0);
}

try {
  const only = values.only;
  const cells =
    only === undefined || only.length === 0
      ? enumerateDressRehearsalCells()
      : enumerateDressRehearsalCells().filter((cell) => only.includes(cell.relativePath));

  if (only !== undefined && only.length > 0 && cells.length !== only.length) {
    const known = new Set(enumerateDressRehearsalCells().map((c) => c.relativePath));
    const missing = only.filter((path) => !known.has(path));
    throw new Error(`unknown dress-rehearsal config(s): ${missing.join(", ")}`);
  }

  if (values.validate) {
    for (const cell of cells) {
      const loaded = loadExperimentConfig(resolve(cell.relativePath));
      console.log(
        `ok ${cell.relativePath} architecture=${loaded.config.architecture} n=${loaded.config.toolspaceSize} topK=${loaded.config.topK}`,
      );
    }
    console.log(`validated ${cells.length} dress-rehearsal config(s)`);
    process.exit(0);
  }

  const report = await runDressRehearsal({
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
    `dress-rehearsal timestamp=${report.timestamp} dryRun=${report.dryRun} completed=${report.completed} failed=${report.failed} skipped=${report.skipped} pending=${report.pending} tasks=${report.task_subset.task_count}`,
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
