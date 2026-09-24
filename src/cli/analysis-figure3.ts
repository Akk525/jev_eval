import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure3Error,
  buildFigure3,
  loadAnalysisDatasetFile,
  writeFigure3,
} from "../analysis/figure3-latency.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure3" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure3 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 3 (latency vs toolspace size) from a normalized analysis
dataset alone. Includes mean / p50 / p95 for router, agent, and total.
Tool-executor latency is marked unavailable. Does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure3.

Writes:
  figure3-latency.json
  figure3-latency.csv
  figure3-latency.svg

Examples:
  npm run analysis:figure3 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure3Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const data = buildFigure3(dataset);
  const paths = writeFigure3(data, resolve(values.out));
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
