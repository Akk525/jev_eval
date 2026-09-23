import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadExperimentConfig } from "../config/load.js";
import { runLiveSlice } from "../eval/runner/live.js";
import { runMockedSlice } from "../eval/runner/slice.js";
import { runSmokeCommand } from "../eval/runner/smoke.js";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    results: { type: "string", default: "results" },
    help: { type: "boolean", default: false },
    validate: { type: "boolean", default: false },
    mock: { type: "boolean", default: false },
    "router-only": { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run eval -- --config <file> [--results <dir>] [--validate] [--mock] [--router-only]

--config <file>  Experiment config. Required except with --help.
--results <dir>  Result directory root. Default: results.
--validate       Load and check the config, then exit. Does not call a provider.
--mock           Run baseline, Jev, or LLM offline with scripted router/agent. No live APIs.
--router-only    Stop after routing. Score Recall@k. Do not call the agent.

Mocked vertical slice:
  npm run eval -- --config configs/jev-top5-20.yaml --mock
  npm run eval -- --config configs/baseline-20.yaml --mock
  npm run eval -- --config configs/llm-top5-20.yaml --mock
  npm run eval -- --config configs/jev-router-only-20.yaml --mock

Live vertical slice (needs AGENT_API_KEY; Jev also needs TYPESAFE_API_KEY):
  npm run eval -- --config configs/baseline-20.yaml
  npm run eval -- --config configs/jev-top5-20.yaml

Router-only live (needs TYPESAFE_API_KEY for Jev; no AGENT_API_KEY):
  npm run eval -- --config configs/jev-router-only-20.yaml
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
  const loaded = loadExperimentConfig(configPath);
  const routerOnly = values["router-only"] === true || loaded.config.routerOnly;
  const config = routerOnly ? { ...loaded.config, routerOnly: true } : loaded.config;

  if (values.validate) {
    const k = config.topK === null ? "all" : String(config.topK);
    const router = config.router === null ? "none" : `${config.router.provider}/${config.router.model}`;
    const mode = config.routerOnly ? "router-only" : "full";
    console.log(
      `validated ${config.architecture} n=${config.toolspaceSize} k=${k} mode=${mode} agent=${config.agent.provider}/${config.agent.model} router=${router}`,
    );
  } else if (values.mock) {
    const directory = await runMockedSlice({
      configPath,
      resultsRoot,
      ...(routerOnly ? { routerOnly: true } : {}),
    });
    console.log(directory);
  } else if (config.architecture === "mock") {
    const directory = await runSmokeCommand({ configPath, resultsRoot });
    console.log(directory);
  } else if (config.architecture === "baseline" || config.architecture === "jev") {
    const directory = await runLiveSlice({
      configPath,
      resultsRoot,
      ...(routerOnly ? { routerOnly: true } : {}),
    });
    console.log(directory);
  } else {
    throw new Error(`architecture ${config.architecture} is not implemented`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
