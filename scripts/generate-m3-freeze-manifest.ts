/**
 * Writes the pre-execution M3 freeze plan under analysis/m3-freeze/.
 * Enumerates every planned cell and scientific pin — no live runs.
 *
 *   npx tsx scripts/generate-m3-freeze-manifest.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configHash } from "../src/config/load.js";
import { enumerateMatrixCells, MATRIX_DATASET_PATH } from "../src/config/matrix.js";
import { loadDataset } from "../src/dataset/schema.js";
import { createCatalogRegistry } from "../src/tools/catalog.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(repoRoot, "analysis/m3-freeze");
mkdirSync(outDir, { recursive: true });

const cells = enumerateMatrixCells();
const tasks = loadDataset(join(repoRoot, MATRIX_DATASET_PATH));
const registry = createCatalogRegistry();
const tools = registry.list();
const taskIds = tasks.map((t) => t.id).sort();

const plan = {
  version: 1,
  kind: "m3_matrix_freeze_plan",
  status: "frozen_pending_approval",
  note:
    "Pre-execution scientific plan. Do not launch live M3 until freeze review is approved. " +
    "Dress rehearsal 2026-09-24T053415Z @ commit 2a99ed2 remains an immutable engineering artifact.",
  scientific_controls: {
    dataset_path: MATRIX_DATASET_PATH,
    dataset_version: tasks[0]?.version ?? null,
    task_count: tasks.length,
    task_ids: taskIds,
    registry_tool_count: tools.length,
    registry_hash: registry.hash(),
    nested_toolspace: "required_tools ∪ prefix(distractor_sequence, N − |required|); sizes nest",
    jev_model: { provider: "typesafe", model: "jev-1.13.0" },
    agent_model: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
    pricing_version: "v1",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    tracing: "noop",
    architectures: {
      baseline: { topK: null, router: null },
      jev_top1: { topK: 1, router: { provider: "typesafe", model: "jev-1.13.0" } },
      jev_top5: { topK: 5, router: { provider: "typesafe", model: "jev-1.13.0" } },
    },
    excluded_from_m3: ["llm_top5"],
    llm_archive_path: "configs/archive/llm-top5-matrix/",
  },
  latency: {
    totalLatencyMs:
      "Monotonic wall-clock ms for the complete attempted runner path (attempt start → append). " +
      "Always written. For R0, time until infrastructure failure classification. " +
      "Tool-executor-only latency is unavailable and must not be fabricated.",
    summary_total_latency_ms: "Non-R0 attempts only",
    summary_total_latency_ms_r0: "R0 attempts only",
    component_fields_preserved: ["routerLatencyMs", "agentLatencyMs"],
  },
  r0_policy: {
    quality_denominators:
      "R0 excluded from ESR, Recall@k, selection accuracy (executionExcluded / routingExcluded)",
    latency_denominators: "R0 excluded from total_latency_ms; reported in total_latency_ms_r0",
    tokens_and_cost: "R0 rows remain in attempts / token+cost totals when recorded",
  },
  expected_attempted_runs: cells.length * tasks.length * 1,
  cells: cells.map((cell) => ({
    id: cell.id,
    relativePath: cell.relativePath,
    architecture: cell.config.architecture,
    toolspaceSize: cell.config.toolspaceSize,
    topK: cell.config.topK,
    config_hash: configHash(cell.config),
    datasetPath: cell.config.datasetPath,
    repetitions: cell.config.repetitions,
    concurrency: cell.config.concurrency,
    seed: cell.config.seed,
    agent: cell.config.agent,
    router: cell.config.router,
    pricingVersion: cell.config.pricingVersion,
    tracing: cell.config.tracing,
  })),
};

const jsonPath = join(outDir, "matrix-plan.json");
writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(`wrote ${jsonPath}`);
console.log(
  JSON.stringify(
    {
      cells: plan.cells.length,
      tasks: plan.scientific_controls.task_count,
      tools: plan.scientific_controls.registry_tool_count,
      expected_attempts: plan.expected_attempted_runs,
      registry_hash: plan.scientific_controls.registry_hash,
    },
    null,
    2,
  ),
);
