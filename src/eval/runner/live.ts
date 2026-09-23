import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createSingleStepAgent } from "../../agent/single-step.js";
import { createScriptedAgent } from "../../agent/mock.js";
import { configHash, loadExperimentConfig } from "../../config/load.js";
import { loadDataset } from "../../dataset/schema.js";
import { loadPricingTable } from "../../pricing/load.js";
import { createOpenAIChatProvider } from "../../providers/openai/client.js";
import { createTypeSafeDecisionProvider } from "../../providers/typesafe/client.js";
import { createBaselineRouter } from "../../routers/baseline/baseline.js";
import { createJevRouter } from "../../routers/jev/jev.js";
import type { Router } from "../../routers/types.js";
import { openResultDirectory } from "../../results/writer.js";
import { createCatalogRegistry } from "../../tools/catalog.js";
import { catalogFixture } from "../../tools/fixtures/catalog.js";
import { createMemoraTracerFromEnv } from "../../tracing/memora/adapter.js";
import { NoopTracer } from "../../tracing/tracer.js";
import type { ExperimentConfig } from "../../types/config.js";
import { resultTimestamp } from "./smoke.js";
import { runExperiment } from "./run.js";

export interface LiveSliceCommand {
  configPath: string;
  resultsRoot: string;
  env?: NodeJS.ProcessEnv;
  timestamp?: string;
  resume?: boolean;
  pricingPath?: string;
  /** Override config.routerOnly. When true, AGENT_API_KEY is not required. */
  routerOnly?: boolean;
}

/**
 * Live vertical-slice run for baseline or Jev.
 * Full runs require AGENT_API_KEY. Jev also requires TYPESAFE_API_KEY.
 * Router-only Jev runs need only TYPESAFE_API_KEY.
 */
export async function runLiveSlice(command: LiveSliceCommand): Promise<string> {
  const env = command.env ?? process.env;
  const loaded = loadExperimentConfig(command.configPath);
  if (loaded.config.architecture !== "baseline" && loaded.config.architecture !== "jev") {
    throw new Error(`live slice supports baseline and jev, not ${loaded.config.architecture}`);
  }
  const architecture = loaded.config.architecture;
  const config: ExperimentConfig = {
    ...loaded.config,
    architecture,
    ...(command.routerOnly === true ? { routerOnly: true } : {}),
  };
  const hash = configHash(config);

  if (!config.routerOnly) {
    const agentKey = env.AGENT_API_KEY?.trim() ?? "";
    if (agentKey === "") throw new Error("AGENT_API_KEY is required for a live run");
    if (config.agent.provider !== "openai") {
      throw new Error(`live agent provider ${config.agent.provider} is not implemented`);
    }
  }

  const tasks = loadDataset(resolve(config.datasetPath));
  const registry = createCatalogRegistry();
  const pricing = loadPricingTable(command.pricingPath ?? resolve("pricing", `${config.pricingVersion}.json`));
  const tracer =
    config.tracing === "memora" ? createMemoraTracerFromEnv(env) ?? new NoopTracer() : new NoopTracer();
  const results = openResultDirectory({
    root: command.resultsRoot,
    timestamp: command.timestamp ?? resultTimestamp(new Date()),
    config,
    configHash: hash,
    datasetVersion: String(tasks[0]?.version ?? 1),
    registryHash: registry.hash(),
    gitSha: gitSha(),
    ...(command.resume === true ? { resume: true } : {}),
  });

  const agent = config.routerOnly
    ? createScriptedAgent(new Map())
    : createSingleStepAgent({
        provider: createOpenAIChatProvider({
          apiKey: env.AGENT_API_KEY!.trim(),
          model: config.agent.model,
        }),
        temperature: config.agent.temperature,
      });

  await runExperiment({
    config,
    tasks,
    registry,
    router: liveRouter(config, env),
    agent,
    tracer,
    results,
    pricing,
    fixture: catalogFixture,
  });
  return results.directory;
}

function liveRouter(config: ExperimentConfig, env: NodeJS.ProcessEnv): Router {
  if (config.architecture === "baseline") return createBaselineRouter();
  if (config.architecture !== "jev" || config.router === null) {
    throw new Error("jev architecture requires a router model");
  }
  if (config.router.provider !== "typesafe") {
    throw new Error(`live router provider ${config.router.provider} is not implemented`);
  }
  const key = env.TYPESAFE_API_KEY?.trim() ?? "";
  if (key === "") throw new Error("TYPESAFE_API_KEY is required for a live Jev run");
  return createJevRouter(createTypeSafeDecisionProvider({ apiKey: key, model: config.router.model }));
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
