import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure4Error,
  buildFigure4,
  loadAnalysisDatasetFile,
  writeFigure4,
} from "../analysis/figure4-recall.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure4" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure4 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 4 (routing Recall@k vs k) from a normalized analysis dataset.
Strict and lenient series stay distinct. k-ablation points appear when M4
dirs contribute multiple top-k values. Does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure4.

Writes:
  figure4-recall.json
  figure4-recall.csv
  figure4-recall.svg

Examples:
  npm run analysis:figure4 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure4Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const data = buildFigure4(dataset);
  const paths = writeFigure4(data, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        points: data.points.length,
        series: data.series.map((series) => series.key),
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
