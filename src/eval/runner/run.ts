import { readFileSync } from "node:fs";
import type { Agent } from "../../agent/types.js";
import { classifyAttempt } from "../failures/classify.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import type { Router } from "../../routers/types.js";
import type { OpenResultDirectory, ResultSummary } from "../../results/writer.js";
import { toolspaceForTask } from "../../tools/toolspace.js";
import type { ExperimentConfig } from "../../types/config.js";
import type { Tracer } from "../../tracing/tracer.js";
import type { ToolRegistry } from "../../tools/registry/registry.js";

export interface ExperimentRun {
  config: ExperimentConfig;
  tasks: readonly BenchmarkTask[];
  registry: ToolRegistry;
  router: Router;
  agent: Agent;
  tracer: Tracer;
  results: OpenResultDirectory;
}

export async function runExperiment(run: ExperimentRun): Promise<ResultSummary> {
  const tools = run.registry.list();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const k = run.config.topK ?? tools.length;
  const handle = await run.tracer.startRun({ runId: run.results.directory });

  try {
    for (const task of run.tasks) {
      for (let repetition = 0; repetition < run.config.repetitions; repetition += 1) {
        if (run.results.completedKey(task.id, repetition)) continue;
        const toolspace = toolspaceForTask(task.required_tools, tools, run.registry.tail, run.config.toolspaceSize);
        if (toolspace === null) continue;

        await run.tracer.event(handle, {
          type: "task_started",
          taskId: task.id,
          repetition,
          toolspace,
        });

        const presented = toolspace.map((name) => {
          const tool = byName.get(name);
          if (!tool) throw new Error(`toolspace named a missing tool: ${name}`);
          return tool;
        });
        const decision = await run.router.route({ taskPrompt: task.prompt, tools: presented, k });
        await run.tracer.event(handle, { type: "routing_completed", decision });

        const candidateNames = new Set(decision.candidates.map((candidate) => candidate.name));
        const candidates = presented.filter((tool) => candidateNames.has(tool.name));
        const turn = await run.agent.run({ taskPrompt: task.prompt, tools: candidates });
        await run.tracer.event(handle, { type: "agent_completed", turn });

        const toolResult = turn.selectedTool === null
          ? null
          : run.registry.execute(turn.selectedTool, turn.arguments, {});
        if (toolResult) await run.tracer.event(handle, { type: "tool_completed", result: toolResult });

        const classification = classifyAttempt({
          requiredTools: task.required_tools,
          acceptableTools: task.acceptable_tools,
          ...(task.expected_arguments === undefined ? {} : { expectedArguments: task.expected_arguments }),
          router: { status: "valid", decision },
          agent: { status: "valid", turn },
          tool: toolResult === null ? { status: "not_run" } : { status: "result", result: toolResult },
        });
        await run.tracer.event(handle, {
          type: "evaluation_completed",
          executionSuccess: classification.executionSuccess,
          failureCode: classification.code,
          infrastructureReason: classification.infrastructureReason,
        });

        run.results.append({
          taskId: task.id,
          repetition,
          toolspace,
          executionExcluded: classification.executionExcluded,
          routingExcluded: classification.routingExcluded,
          executionSuccess: classification.executionSuccess,
          failureCode: classification.code,
          infrastructureReason: classification.infrastructureReason,
        });
      }
    }
    await run.tracer.endRun(handle, "completed");
  } catch (error) {
    await run.tracer.endRun(handle, "failed");
    throw error;
  }

  return JSON.parse(readFileSync(`${run.results.directory}/summary.json`, "utf8")) as ResultSummary;
}
