import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runSmokeCommand } from "../eval/runner/smoke.js";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    results: { type: "string", default: "results" },
  },
  strict: true,
});

if (values.config === undefined) {
  console.error("not implemented: pass --config <file>");
  process.exit(1);
}

try {
  const directory = await runSmokeCommand({
    configPath: resolve(values.config),
    resultsRoot: resolve(values.results),
  });
  console.log(directory);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
