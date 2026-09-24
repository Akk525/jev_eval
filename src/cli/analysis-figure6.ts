import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure6Error,
  buildFigure6,
  loadAnalysisDatasetFile,
  writeFigure6,
} from "../analysis/figure6-failures.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure6" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure6 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 6 (failure decomposition vs N) from a normalized analysis
dataset. R0 stays separate from R1–R6. Does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure6.

Writes:
  figure6-failures.json
  figure6-failures.csv
  figure6-failures.svg

Examples:
  npm run analysis:figure6 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure6Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const data = buildFigure6(dataset);
  const paths = writeFigure6(data, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        points: data.points.length,
        active_codes: data.active_codes,
        series: data.series.map((series) => ({
          architecture: series.architecture,
          router_only: series.router_only,
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
