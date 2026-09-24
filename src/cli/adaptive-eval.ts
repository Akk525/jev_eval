#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  adaptiveEvalTablesToCsv,
  adaptiveEvalTablesToJson,
  buildAdaptiveEvalTables,
} from "../analysis/adaptive-eval-tables.js";
import { enumerateAdaptiveEvalCells } from "../config/adaptive-eval.js";
import { loadExperimentConfig } from "../config/load.js";
import { loadDotEnv } from "../env/load.js";
import { MatrixOrchestratorError } from "../eval/runner/matrix.js";
import { runAdaptiveEval } from "../eval/runner/adaptive-eval.js";

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
    summarize: { type: "boolean", default: false },
    format: { type: "string", default: "json" },
    out: { type: "string" },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run adaptive-eval -- [options]

Compare adaptive routing to fixed-k Jev (k=1, k=5) and baseline on the #44
holdout split (odd FNV-1a taskId hash — complement of the #42 development set).

--results <dir>     Result root. Default: results.
--dry-run           Enumerate the plan and exit.
--mock              Offline scripted routers/agent (CI-safe).
--resume            Continue an interrupted run from _adaptive-eval/<timestamp>.json.
--timestamp <id>    Shared result timestamp / manifest id.
--only <config>     Restrict to one or more repo-relative adaptive-eval configs.
--validate          Load every selected config and exit.
--summarize         Rebuild comparison tables from result dirs (no new runs).
--format json|csv   Summarize output format. Default: json.
--out <file>        Write summarize output to this path (default: stdout).

Examples:
  npm run adaptive-eval -- --dry-run
  npm run adaptive-eval -- --validate
  npm run adaptive-eval -- --mock --results /tmp/jev-adaptive-eval
  npm run adaptive-eval -- --summarize --results /tmp/jev-adaptive-eval --out analysis/adaptive-eval.json
`);
  process.exit(0);
}

try {
  const only = values.only;
  const cells =
    only === undefined || only.length === 0
      ? enumerateAdaptiveEvalCells()
      : enumerateAdaptiveEvalCells().filter((cell) => only.includes(cell.relativePath));

  if (only !== undefined && only.length > 0 && cells.length !== only.length) {
    const known = new Set(enumerateAdaptiveEvalCells().map((c) => c.relativePath));
    const missing = only.filter((path) => !known.has(path));
    throw new Error(`unknown adaptive-eval config(s): ${missing.join(", ")}`);
  }

  if (values.validate) {
    for (const cell of cells) {
      const loaded = loadExperimentConfig(resolve(cell.relativePath));
      console.log(
        `ok ${cell.relativePath} architecture=${loaded.config.architecture} topK=${loaded.config.topK}`,
      );
    }
    process.exit(0);
  }

  if (values.summarize) {
    const tables = buildAdaptiveEvalTables(resolve(values.results));
    const text =
      values.format === "csv" ? adaptiveEvalTablesToCsv(tables) : adaptiveEvalTablesToJson(tables);
    if (values.out) {
      mkdirSync(dirname(resolve(values.out)), { recursive: true });
      writeFileSync(resolve(values.out), text);
      console.error(`wrote ${values.out}`);
    } else {
      process.stdout.write(text);
    }
    process.exit(0);
  }

  const report = await runAdaptiveEval({
    resultsRoot: resolve(values.results),
    dryRun: values["dry-run"],
    mock: values.mock,
    resume: values.resume,
    ...(values.timestamp === undefined ? {} : { timestamp: values.timestamp }),
    ...(only === undefined || only.length === 0 ? {} : { only }),
    cells,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.failed > 0) process.exit(1);
} catch (error) {
  if (error instanceof MatrixOrchestratorError || error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
