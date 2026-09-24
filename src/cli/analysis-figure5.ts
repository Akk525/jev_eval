import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure5Error,
  buildFigure5,
  loadAnalysisDatasetFile,
  writeFigure5,
} from "../analysis/figure5-calibration.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure5" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure5 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 5 (Jev calibration) from a normalized analysis dataset.
Calibrates provider confidence and top-1 probability separately (D4).
Reports ECE with the same buckets as summary.json. Does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure5.

Writes:
  figure5-calibration.json
  figure5-calibration.csv
  figure5-calibration.svg

Examples:
  npm run analysis:figure5 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure5Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const data = buildFigure5(dataset);
  const paths = writeFigure5(data, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        jev_attempts: data.jev_attempts,
        confidence_ece: data.confidence.ece,
        confidence_scored: data.confidence.scored,
        top1_ece: data.top1_probability.ece,
        top1_scored: data.top1_probability.scored,
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
