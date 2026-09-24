import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure1Error,
  buildFigure1,
  loadAnalysisDatasetFile,
  writeFigure1,
} from "../analysis/figure1-esr.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure1" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure1 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 1 (Execution Success Rate vs toolspace size) from a normalized
analysis dataset alone. Regenerates data + SVG; does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure1.

Writes:
  figure1-esr.json
  figure1-esr.csv
  figure1-esr.svg

Examples:
  npm run analysis:figure1 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure1Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const data = buildFigure1(dataset);
  const paths = writeFigure1(data, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        series: data.series.map((series) => ({
          architecture: series.architecture,
          points: series.points.length,
        })),
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
