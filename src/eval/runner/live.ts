import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createSingleStepAgent } from "../../agent/single-step.js";
import { createScriptedAgent } from "../../agent/mock.js";
import type { Agent } from "../../agent/types.js";
import { configHash, loadExperimentConfig } from "../../config/load.js";
import { loadDataset, type BenchmarkTask } from "../../dataset/schema.js";
import { loadPricingTable } from "../../pricing/load.js";
import { createOpenAIChatProvider } from "../../providers/openai/client.js";
import { createOpenAIRankProvider } from "../../providers/openai/rank.js";
import { createTypeSafeDecisionProvider } from "../../providers/typesafe/client.js";
import { createBaselineRouter } from "../../routers/baseline/baseline.js";
import { createJevRouter } from "../../routers/jev/jev.js";
import { createLlmRouter } from "../../routers/llm/llm.js";
import { createAdaptiveRouter } from "../../routers/adaptive/adaptive.js";
import { loadAdaptivePolicy } from "../../routers/adaptive/policy.js";
import type { Router } from "../../routers/types.js";
import { openResultDirectory } from "../../results/writer.js";
import { createCatalogRegistry } from "../../tools/catalog.js";
import { catalogFixture } from "../../tools/fixtures/catalog.js";
import { createMemoraTracerFromEnv } from "../../tracing/memora/adapter.js";
import { NoopTracer } from "../../tracing/tracer.js";
import type { Architecture, ExperimentConfig } from "../../types/config.js";
import { resultTimestamp } from "./smoke.js";
import { runExperiment } from "./run.js";

const LIVE_ARCHITECTURES = new Set<Architecture>(["baseline", "jev", "llm", "adaptive"]);

export interface LiveSliceCommand {
  configPath: string;
  resultsRoot: string;
  env?: NodeJS.ProcessEnv;
  timestamp?: string;
  resume?: boolean;
  pricingPath?: string;
  /** Override config.routerOnly. When true, AGENT_API_KEY is not required for the agent. */
  routerOnly?: boolean;
  /** Defaults to the config dataset. Pass a subset for faster tests. */
  tasks?: readonly BenchmarkTask[];
  /** Injectable fetch for offline tests. Never used in CI live runs. */
  fetch?: typeof fetch;
}

export type LiveAgentKind = "single-step" | "scripted";

/**
 * Live vertical-slice run for baseline, Jev, or LLM.
 * Full runs require AGENT_API_KEY. Jev also requires TYPESAFE_API_KEY.
 * LLM router reuses AGENT_API_KEY when the router provider is openai.
 * Router-only Jev runs need only TYPESAFE_API_KEY; router-only LLM needs AGENT_API_KEY for ranking.
 */
export async function runLiveSlice(command: LiveSliceCommand): Promise<string> {
  const env = command.env ?? process.env;
  const loaded = loadExperimentConfig(command.configPath);
  if (!LIVE_ARCHITECTURES.has(loaded.config.architecture)) {
    throw new Error(`live slice supports baseline, jev, llm, and adaptive, not ${loaded.config.architecture}`);
  }
  const architecture = loaded.config.architecture;
  const config: ExperimentConfig = {
    ...loaded.config,
    architecture,
    ...(command.routerOnly === true ? { routerOnly: true } : {}),
  };
  const hash = configHash(config);
  const fetchImpl = command.fetch;

  requireLiveKeys(config, env);

  const tasks = command.tasks ?? loadDataset(resolve(config.datasetPath));
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

  const agentResolution = resolveLiveAgent(config, env, fetchImpl);
  await runExperiment({
    config,
    tasks,
    registry,
    router: resolveLiveRouter(config, env, fetchImpl),
    agent: agentResolution.agent,
    tracer,
    results,
    pricing,
    fixture: catalogFixture,
  });
  return results.directory;
}

/** Shared live agent: same single-step implementation for baseline, Jev, and LLM. */
export function resolveLiveAgent(
  config: ExperimentConfig,
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
): { kind: LiveAgentKind; agent: Agent } {
  if (config.routerOnly) {
    return { kind: "scripted", agent: createScriptedAgent(new Map()) };
  }
  if (config.agent.provider !== "openai") {
    throw new Error(`live agent provider ${config.agent.provider} is not implemented`);
  }
  const agentKey = env.AGENT_API_KEY?.trim() ?? "";
  if (agentKey === "") throw new Error("AGENT_API_KEY is required for a live run");
  return {
    kind: "single-step",
    agent: createSingleStepAgent({
      provider: createOpenAIChatProvider({
        apiKey: agentKey,
        model: config.agent.model,
        ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
      }),
      temperature: config.agent.temperature,
    }),
  };
}

export function resolveLiveRouter(
  config: ExperimentConfig,
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
): Router {
  if (config.architecture === "baseline") return createBaselineRouter();

  if (config.architecture === "jev") {
    if (config.router === null) throw new Error("jev architecture requires a router model");
    if (config.router.provider !== "typesafe") {
      throw new Error(`live router provider ${config.router.provider} is not implemented`);
    }
    const key = env.TYPESAFE_API_KEY?.trim() ?? "";
    if (key === "") throw new Error("TYPESAFE_API_KEY is required for a live Jev run");
    return createJevRouter(createTypeSafeDecisionProvider({ apiKey: key, model: config.router.model }));
  }

  if (config.architecture === "llm") {
    if (config.router === null) throw new Error("llm architecture requires a router model");
    if (config.router.provider !== "openai") {
      throw new Error(`live llm router provider ${config.router.provider} is not implemented`);
    }
    const key = env.AGENT_API_KEY?.trim() ?? "";
    if (key === "") throw new Error("AGENT_API_KEY is required for a live LLM router run");
    return createLlmRouter(
      createOpenAIRankProvider({
        apiKey: key,
        model: config.router.model,
        temperature: 0,
        ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
      }),
    );
  }

  if (config.architecture === "adaptive") {
    if (config.router === null) throw new Error("adaptive architecture requires a primary Jev router");
    if (config.escalateRouter === null) throw new Error("adaptive architecture requires escalateRouter");
    if (config.adaptivePolicyPath === null) throw new Error("adaptive architecture requires adaptivePolicyPath");
    if (config.router.provider !== "typesafe") {
      throw new Error(`live adaptive Jev provider ${config.router.provider} is not implemented`);
    }
    if (config.escalateRouter.provider !== "openai") {
      throw new Error(`live adaptive escalate provider ${config.escalateRouter.provider} is not implemented`);
    }
    const typesafeKey = env.TYPESAFE_API_KEY?.trim() ?? "";
    if (typesafeKey === "") throw new Error("TYPESAFE_API_KEY is required for a live adaptive run");
    const agentKey = env.AGENT_API_KEY?.trim() ?? "";
    if (agentKey === "") throw new Error("AGENT_API_KEY is required for a live adaptive escalate router");
    return createAdaptiveRouter({
      policy: loadAdaptivePolicy(resolve(config.adaptivePolicyPath)),
      jev: createJevRouter(
        createTypeSafeDecisionProvider({ apiKey: typesafeKey, model: config.router.model }),
      ),
      escalate: createLlmRouter(
        createOpenAIRankProvider({
          apiKey: agentKey,
          model: config.escalateRouter.model,
          temperature: 0,
          ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
        }),
      ),
    });
  }

  throw new Error(`live slice supports baseline, jev, llm, and adaptive, not ${config.architecture}`);
}

function requireLiveKeys(config: ExperimentConfig, env: NodeJS.ProcessEnv): void {
  if (
    (config.architecture === "jev" || config.architecture === "adaptive") &&
    (env.TYPESAFE_API_KEY?.trim() ?? "") === ""
  ) {
    throw new Error(
      config.architecture === "adaptive"
        ? "TYPESAFE_API_KEY is required for a live adaptive run"
        : "TYPESAFE_API_KEY is required for a live Jev run",
    );
  }

  const needsAgentKey =
    config.architecture === "llm" ||
    config.architecture === "adaptive" ||
    (!config.routerOnly && (config.architecture === "baseline" || config.architecture === "jev"));
  if (needsAgentKey && (env.AGENT_API_KEY?.trim() ?? "") === "") {
    throw new Error(
      config.architecture === "llm"
        ? "AGENT_API_KEY is required for a live LLM router run"
        : config.architecture === "adaptive"
          ? "AGENT_API_KEY is required for a live adaptive run"
          : "AGENT_API_KEY is required for a live run",
    );
  }

  if (!config.routerOnly && config.agent.provider !== "openai") {
    throw new Error(`live agent provider ${config.agent.provider} is not implemented`);
  }
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
