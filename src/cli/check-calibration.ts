import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkCalibrationBearingDirs } from "../analysis/calibration-check.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run check:calibration -- [--results <dir>]

Checklist for #42: find Jev result directories that can support adaptive-policy
threshold selection (calibration.scored > 0 and non-constant confidence).

Exits 0 only when at least one usable directory exists.
`);
  process.exit(0);
}

const report = checkCalibrationBearingDirs(resolve(values.results));
console.log(JSON.stringify(report, null, 2));
if (!report.ready_for_threshold_lock) {
  console.error(
    "not ready: need Jev result dirs with calibration-scored attempts and varying confidence (see docs/adaptive-policy.md)",
  );
  process.exit(1);
}
console.log(`ready: ${report.usable.length} usable calibration-bearing director(y/ies)`);
