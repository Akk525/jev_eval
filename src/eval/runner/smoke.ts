import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createScriptedAgent } from "../../agent/mock.js";
import type { ScriptedCall } from "../../agent/mock.js";
import { loadExperimentConfig } from "../../config/load.js";
import { loadDataset, type BenchmarkTask } from "../../dataset/schema.js";
import { createScriptedRouter } from "../../routers/mock.js";
import { openResultDirectory } from "../../results/writer.js";
import { createSmokeRegistry } from "../../tools/smoke.js";
import { NoopTracer } from "../../tracing/tracer.js";
import { runExperiment } from "./run.js";

export interface SmokeCommand {
  configPath: string;
  resultsRoot: string;
}

export async function runSmokeCommand(command: SmokeCommand): Promise<string> {
  const loaded = loadExperimentConfig(command.configPath);
  if (loaded.config.architecture !== "mock") {
    throw new Error(`architecture ${loaded.config.architecture} is not implemented`);
  }

  const tasks = loadDataset(resolve(loaded.config.datasetPath));
  const script = scriptFromTasks(tasks);
  const registry = createSmokeRegistry();
  const timestamp = resultTimestamp(new Date());
  const results = openResultDirectory({
    root: command.resultsRoot,
    timestamp,
    config: loaded.config,
    configHash: loaded.hash,
    datasetVersion: String(tasks[0]?.version ?? 1),
    registryHash: registry.hash(),
    gitSha: gitSha(),
  });

  await runExperiment({
    config: loaded.config,
    tasks,
    registry,
    router: createScriptedRouter(script.preferred),
    agent: createScriptedAgent(script.calls),
    tracer: new NoopTracer(),
    results,
  });
  return results.directory;
}

function scriptFromTasks(tasks: readonly BenchmarkTask[]): {
  preferred: Map<string, string>;
  calls: Map<string, ScriptedCall>;
} {
  const preferred = new Map<string, string>();
  const calls = new Map<string, ScriptedCall>();
  for (const task of tasks) {
    const tool = task.required_tools[0];
    if (tool === undefined) continue;
    preferred.set(task.prompt, tool);
    calls.set(task.prompt, { tool, arguments: task.expected_arguments ?? {} });
  }
  return { preferred, calls };
}

export function resultTimestamp(date: Date): string {
  const iso = date.toISOString();
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 19).replaceAll(":", "");
  return `${day}T${time}Z`;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
