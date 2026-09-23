import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadExperimentConfig } from "../config/load.js";
import { runMockedSlice } from "../eval/runner/slice.js";
import { runSmokeCommand } from "../eval/runner/smoke.js";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    results: { type: "string", default: "results" },
    help: { type: "boolean", default: false },
    validate: { type: "boolean", default: false },
    mock: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run eval -- --config <file> [--results <dir>] [--validate] [--mock]

--config <file>  Experiment config. Required except with --help.
--results <dir>  Result directory root. Default: results.
--validate       Load and check the config, then exit. Does not call a provider.
--mock           Run baseline or Jev offline with scripted router/agent. No live APIs.

Mocked vertical slice:
  npm run eval -- --config configs/jev-top5-20.yaml --mock
  npm run eval -- --config configs/baseline-20.yaml --mock
`);
  process.exit(0);
}

if (values.config === undefined) {
  console.error("not implemented: pass --config <file>");
  process.exit(1);
}

try {
  const configPath = resolve(values.config);
  const resultsRoot = resolve(values.results);

  if (values.validate) {
    const { config } = loadExperimentConfig(configPath);
    const k = config.topK === null ? "all" : String(config.topK);
    const router = config.router === null ? "none" : `${config.router.provider}/${config.router.model}`;
    console.log(
      `validated ${config.architecture} n=${config.toolspaceSize} k=${k} agent=${config.agent.provider}/${config.agent.model} router=${router}`,
    );
  } else if (values.mock) {
    const directory = await runMockedSlice({ configPath, resultsRoot });
    console.log(directory);
  } else {
    const directory = await runSmokeCommand({ configPath, resultsRoot });
    console.log(directory);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
