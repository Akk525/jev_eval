/**
 * Writes the pre-execution M4 freeze plan under analysis/m4-freeze/.
 * Enumerates every planned cell and scientific pin — no live runs.
 *
 *   npx tsx scripts/generate-m4-freeze-manifest.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configHash } from "../src/config/load.js";
import {
  K_SWEEP_TOOLSPACE_SIZE,
  K_SWEEP_TOP_KS,
  enumerateKSweepCells,
} from "../src/config/k-sweep.js";
import { MATRIX_DATASET_PATH, buildMatrixConfig } from "../src/config/matrix.js";
import { loadDataset } from "../src/dataset/schema.js";
import { createCatalogRegistry } from "../src/tools/catalog.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(repoRoot, "analysis/m4-freeze");
mkdirSync(outDir, { recursive: true });

const cells = enumerateKSweepCells();
const tasks = loadDataset(join(repoRoot, MATRIX_DATASET_PATH));
const registry = createCatalogRegistry();
const tools = registry.list();
const taskIds = tasks.map((t) => t.id).sort();

const m3Top1 = buildMatrixConfig("jev_top1", 100);
const m3Top5 = buildMatrixConfig("jev_top5", 100);
const m4Top1 = cells.find((c) => c.topK === 1)!.config;
const m4Top5 = cells.find((c) => c.topK === 5)!.config;

function withoutTopK<T extends { topK: number | null }>(config: T): Omit<T, "topK"> {
  const { topK: _omit, ...rest } = config;
  void _omit;
  return rest;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object") return false;
  const leftKeys = Object.keys(left as object).sort();
  const rightKeys = Object.keys(right as object).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i++) {
    if (leftKeys[i] !== rightKeys[i]) return false;
    const key = leftKeys[i]!;
    if (!deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

const matchesM3Controls =
  deepEqual(withoutTopK(m4Top1), withoutTopK(m3Top1)) &&
  deepEqual(withoutTopK(m4Top5), withoutTopK(m3Top5));

/** Cost estimate from M3 live N=100 Jev cells (2026-09-24T055854Z), extrapolated for k=3/10. */
const costEstimate = {
  method:
    "Extrapolate from M3 live jev-top1-n100 ($0.0856) and jev-top5-n100 ($0.1224); " +
    "assume router tokens ≈ fixed at N=100 and agent/cost grow roughly with k between anchors.",
  m3_anchors_usd_total: { k1: 0.085637372, k5: 0.122405372 },
  per_cell_usd_estimate: { k1: 0.086, k3: 0.104, k5: 0.122, k10: 0.17 },
  total_usd_estimate: 0.48,
  total_usd_range: [0.45, 0.55],
  note: "Fresh four-cell run; M3 dirs not reused. Estimates only — not a bid.",
};

const plan = {
  version: 1,
  kind: "m4_k_sweep_freeze_plan",
  status: "frozen_pending_approval",
  note:
    "Pre-execution scientific plan. Do not launch live M4 until freeze review is approved. " +
    "M3 live matrix 2026-09-24T055854Z @ fc9fb2a remains immutable. " +
    "k=1 and k=5 are freshly re-executed (not reused from M3).",
  decision: "D14",
  execution_policy: {
    mode: "fresh_ablation",
    reuse_m3_k1_k5: false,
    reason:
      "Prefer one shared execution timestamp/environment for all four cells; " +
      "do not silently mix M3 dirs into M4 aggregates.",
    manifest_dir: "results/_k-sweep/",
    m3_dirs_immutable: true,
  },
  scientific_controls: {
    dataset_path: MATRIX_DATASET_PATH,
    dataset_version: tasks[0]?.version ?? null,
    task_count: tasks.length,
    task_ids: taskIds,
    registry_tool_count: tools.length,
    registry_hash: registry.hash(),
    nested_toolspace: "required_tools ∪ prefix(distractor_sequence, N − |required|); sizes nest",
    distractor_ordering: "preserved from frozen M3 / methodology (per-task distractor_sequence)",
    routing_summaries: "preserved (same dataset + registry + Jev model)",
    toolspace_size: K_SWEEP_TOOLSPACE_SIZE,
    top_ks: [...K_SWEEP_TOP_KS],
    treatment_only: "topK",
    jev_model: { provider: "typesafe", model: "jev-1.13.0" },
    agent_model: { provider: "openai", model: "gpt-5.6-sol", temperature: 0 },
    pricing_version: "v1",
    repetitions: 1,
    concurrency: 1,
    seed: 0,
    tracing: "noop",
    matches_m3_jev_n100_except_topk: matchesM3Controls,
    failure_taxonomy: "R0–R6",
    esr_definition: "executionSuccess among non-executionExcluded attempts",
    denominator_policies:
      "R0 excluded from ESR / Recall@k / selection; R0 latency in total_latency_ms_r0",
  },
  primary_metrics: [
    "strict_recall_at_k",
    "lenient_recall_at_k",
    "execution_success_rate",
    "selection_accuracy",
    "failure_taxonomy_R0_R6",
    "router_tokens",
    "agent_tokens",
    "total_tokens",
    "priced_cost_usd",
    "router_latency_ms",
    "agent_latency_ms",
    "total_latency_ms",
  ],
  offline_analyses: {
    k_sweep_tables: "npm run k-sweep -- --summarize",
    k_tradeoff: "npm run k-sweep -- --tradeoff (decision_rule: null; no optimal-k claim)",
    marginal_routing_utility:
      "Adjacent transitions k=1→3, 3→5, 5→10: coverage vs coverage-with-utility",
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
  persistent_r3_r4:
    "Remain in the benchmark; do not remove or relabel from M3. Analyze routing-insensitive behavior separately after the run.",
  expected_attempted_runs: cells.length * tasks.length * 1,
  cost_estimate: costEstimate,
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

const jsonPath = join(outDir, "k-sweep-plan.json");
writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(`wrote ${jsonPath}`);
console.log(
  JSON.stringify(
    {
      cells: plan.cells.length,
      cell_ids: plan.cells.map((c) => c.id),
      tasks: plan.scientific_controls.task_count,
      tools: plan.scientific_controls.registry_tool_count,
      expected_attempts: plan.expected_attempted_runs,
      registry_hash: plan.scientific_controls.registry_hash,
      matches_m3_except_topk: plan.scientific_controls.matches_m3_jev_n100_except_topk,
      reuse_m3_k1_k5: plan.execution_policy.reuse_m3_k1_k5,
      cost_estimate_usd: plan.cost_estimate.total_usd_estimate,
    },
    null,
    2,
  ),
);
