import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadExperimentConfig } from "../config/load.js";
import { runSmokeCommand } from "../eval/runner/smoke.js";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    results: { type: "string", default: "results" },
    help: { type: "boolean", default: false },
    validate: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run eval -- --config <file> [--results <dir>] [--validate]

--config <file>  Experiment config. Required except with --help.
--results <dir>  Result directory root. Default: results.
--validate       Load and check the config, then exit. Does not call a provider.
`);
  process.exit(0);
}

if (values.config === undefined) {
  console.error("not implemented: pass --config <file>");
  process.exit(1);
}

try {
  if (values.validate) {
    const { config } = loadExperimentConfig(resolve(values.config));
    const k = config.topK === null ? "all" : String(config.topK);
    const router = config.router === null ? "none" : `${config.router.provider}/${config.router.model}`;
    console.log(
      `validated ${config.architecture} n=${config.toolspaceSize} k=${k} agent=${config.agent.provider}/${config.agent.model} router=${router}`,
    );
  } else {
    const directory = await runSmokeCommand({
      configPath: resolve(values.config),
      resultsRoot: resolve(values.results),
    });
    console.log(directory);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
