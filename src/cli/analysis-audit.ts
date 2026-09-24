import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ReproducibilityAuditError,
  loadAnalysisDatasetFile,
  runReproducibilityAudit,
  writeReproducibilityAudit,
} from "../analysis/reproducibility-audit.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    results: { type: "string" },
    out: { type: "string", default: "analysis/audit" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:audit -- (--dataset <file> | --results <dir>) [--out <dir>]

M6 reproducibility audit: verify analysis dataset provenance and that figures
1–6 regenerate. Does not invent numbers. Exits 1 if any check fails.

--dataset <file>  Path to analysis-dataset.json
--results <dir>   Build dataset from result dirs, then audit
--out <dir>       Write reproducibility-audit.json. Default: analysis/audit

See docs/reproducibility-audit.md.
`);
  process.exit(0);
}

try {
  if (!values.dataset && !values.results) {
    throw new ReproducibilityAuditError("provide --dataset <file> or --results <dir>");
  }
  if (values.dataset && values.results) {
    throw new ReproducibilityAuditError("provide only one of --dataset or --results");
  }

  const report = values.dataset
    ? runReproducibilityAudit({
        dataset: loadAnalysisDatasetFile(resolve(values.dataset)),
        datasetPath: resolve(values.dataset),
      })
    : runReproducibilityAudit({ resultsRoot: resolve(values.results!) });

  const path = writeReproducibilityAudit(report, resolve(values.out));
  console.log(JSON.stringify({ ...report, wrote: path }, null, 2));
  if (!report.pass) {
    console.error("reproducibility audit FAILED");
    process.exit(1);
  }
  console.log(
    report.numbers_status === "present"
      ? "reproducibility audit PASSED (pipeline + attempts present)"
      : "reproducibility audit PASSED (pipeline only; numbers unavailable)",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
