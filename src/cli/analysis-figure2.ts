import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Figure2Error,
  buildFigure2Cost,
  buildFigure2Tokens,
  loadAnalysisDatasetFile,
  writeFigure2,
} from "../analysis/figure2-cost-tokens.js";

const { values } = parseArgs({
  options: {
    dataset: { type: "string" },
    out: { type: "string", default: "analysis/figures/figure2" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:figure2 -- --dataset <analysis-dataset.json> [--out <dir>]

Generate Figure 2 cost/task and token-usage series from a normalized analysis
dataset alone. Uses priced costs from the pinned pricing version. Router vs
agent tokens are separate series. Does not rewrite result dirs.

--dataset <file>  Path to analysis-dataset.json from npm run analysis:dataset.
--out <dir>       Output directory. Default: analysis/figures/figure2.

Writes:
  figure2-cost.json|.csv|.svg
  figure2-tokens.json|.csv|.svg

Examples:
  npm run analysis:figure2 -- --dataset analysis/dataset/analysis-dataset.json
`);
  process.exit(0);
}

try {
  if (!values.dataset) {
    throw new Figure2Error("missing --dataset <analysis-dataset.json>");
  }
  const dataset = loadAnalysisDatasetFile(resolve(values.dataset));
  const cost = buildFigure2Cost(dataset);
  const tokens = buildFigure2Tokens(dataset);
  const paths = writeFigure2(cost, tokens, resolve(values.out));
  console.log(
    JSON.stringify(
      {
        pricing_version: cost.pricing_version,
        cost_series: cost.series.map((series) => ({
          architecture: series.architecture,
          points: series.points.length,
        })),
        token_series: tokens.series.map((series) => series.key),
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
