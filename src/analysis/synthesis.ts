import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildKSweepTablesFromLoads } from "./k-sweep-tables.js";
import { buildMarginalRoutingUtilityFromLoads } from "./marginal-routing-utility.js";
import { loadCompletedCellsFromManifest } from "./manifest-scope.js";
import { mcnemarExact, pairedBootstrapMeanDiff } from "./paired-uncertainty.js";
import {
  type ResultDirectoryLoad,
  type ScalingRun,
} from "./scaling-tables.js";
import { renderSynthesisSvgs, type SynthesisFigureJson } from "./synthesis-svg.js";

export const FROZEN_M3_MANIFEST = "results/_matrix/2026-09-24T055854Z.json";
export const FROZEN_M4_MANIFEST = "results/_k-sweep/2026-09-24T140621Z.json";
export const FROZEN_ADAPTIVE_MANIFEST = "results/_adaptive-eval/2026-09-24T045743Z.json";

export interface SynthesisOptions {
  cwd?: string;
  outDir?: string;
  m3Manifest?: string;
  m4Manifest?: string;
  adaptiveManifest?: string;
  bootstrapReplicates?: number;
  bootstrapSeed?: number;
}

export interface SynthesisArtifact {
  version: 1;
  kind: "publication_synthesis";
  generated_at: string;
  sources: {
    m3_manifest: string;
    m4_manifest: string;
    adaptive_manifest: string;
  };
  methodology: {
    paired_bootstrap: string;
    mcnemar: string;
    cost_uncertainty: string;
    latency: string;
    decision_rule: null;
  };
  panels: Record<string, unknown>;
  figures: Record<string, SynthesisFigureJson>;
}

function taskIndex(load: ResultDirectoryLoad): Map<string, ScalingRun> {
  const map = new Map<string, ScalingRun>();
  for (const run of load.runs) {
    const id = run.taskId;
    if (id === undefined) throw new Error(`missing taskId in ${load.directory}`);
    if (map.has(id)) throw new Error(`duplicate taskId ${id} in ${load.directory}`);
    map.set(id, run);
  }
  return map;
}

function success(run: ScalingRun): boolean {
  return !run.executionExcluded && run.executionSuccess;
}

function agentTokens(run: ScalingRun): number {
  return run.agentUsage.inputTokens + run.agentUsage.outputTokens;
}

function cellLabel(load: ResultDirectoryLoad): string {
  const c = load.config;
  if (c.architecture === "baseline") return `baseline_n${c.toolspaceSize}`;
  if (c.architecture === "jev") return `jev_k${c.topK}_n${c.toolspaceSize}`;
  return `${c.architecture}_n${c.toolspaceSize}`;
}

export function buildSynthesis(options: SynthesisOptions = {}): SynthesisArtifact {
  const cwd = options.cwd ?? process.cwd();
  const m3Path = resolve(cwd, options.m3Manifest ?? FROZEN_M3_MANIFEST);
  const m4Path = resolve(cwd, options.m4Manifest ?? FROZEN_M4_MANIFEST);
  const adaptivePath = resolve(cwd, options.adaptiveManifest ?? FROZEN_ADAPTIVE_MANIFEST);
  const replicates = options.bootstrapReplicates ?? 5000;
  const seed = options.bootstrapSeed ?? 0x5e9d0001;

  const m3 = loadCompletedCellsFromManifest(m3Path, { cwd });
  const m4 = loadCompletedCellsFromManifest(m4Path, { cwd });
  const adaptive = loadCompletedCellsFromManifest(adaptivePath, { cwd });

  const m4Tables = buildKSweepTablesFromLoads(m4.directories);
  const marginal = buildMarginalRoutingUtilityFromLoads(m4.directories);

  // Index M3 cells by architecture × N × topK
  const m3ByKey = new Map<string, ResultDirectoryLoad>();
  for (const d of m3.directories) {
    const key = `${d.config.architecture}::${d.config.toolspaceSize}::${d.config.topK}`;
    m3ByKey.set(key, d);
  }
  const m4ByK = new Map<number, ResultDirectoryLoad>();
  for (const d of m4.directories) {
    if (d.config.topK !== null) m4ByK.set(d.config.topK, d);
  }

  const ns = [5, 10, 25, 50, 100] as const;
  const esrVsN = {
    series: ["baseline", "jev_top1", "jev_top5"].map((arch) => ({
      architecture: arch,
      points: ns.map((n) => {
        const topK = arch === "baseline" ? null : arch === "jev_top1" ? 1 : 5;
        const key = `${arch === "baseline" ? "baseline" : "jev"}::${n}::${topK}`;
        const load = m3ByKey.get(key);
        if (!load) return { n, esr: null, attempts: 0 };
        const scored = load.runs.filter((r) => !r.executionExcluded);
        const esr =
          scored.length === 0
            ? null
            : scored.filter((r) => r.executionSuccess).length / scored.length;
        return { n, esr, attempts: load.runs.length };
      }),
    })),
  };

  const costVsN = {
    note: "Cost CI (when shown) is paired-task-sample uncertainty, not run-to-run variance.",
    series: ["baseline", "jev_top1", "jev_top5"].map((arch) => ({
      architecture: arch,
      points: ns.map((n) => {
        const topK = arch === "baseline" ? null : arch === "jev_top1" ? 1 : 5;
        const key = `${arch === "baseline" ? "baseline" : "jev"}::${n}::${topK}`;
        const load = m3ByKey.get(key);
        if (!load) return { n, cost_per_attempt: null };
        const cost =
          load.runs.reduce((s, r) => s + r.pricedCostUsd, 0) / Math.max(1, load.runs.length);
        return { n, cost_per_attempt: cost };
      }),
    })),
  };

  const agentTokensVsN = {
    series: ["baseline", "jev_top1", "jev_top5"].map((arch) => ({
      architecture: arch,
      points: ns.map((n) => {
        const topK = arch === "baseline" ? null : arch === "jev_top1" ? 1 : 5;
        const key = `${arch === "baseline" ? "baseline" : "jev"}::${n}::${topK}`;
        const load = m3ByKey.get(key);
        if (!load) return { n, agent_tokens_mean: null };
        const mean =
          load.runs.reduce((s, r) => s + agentTokens(r), 0) / Math.max(1, load.runs.length);
        return { n, agent_tokens_mean: mean };
      }),
    })),
  };

  // N=100 baseline vs top-5 paired comparison (predeclared)
  const baseline100 = m3ByKey.get("baseline::100::null")!;
  const top5_100 = m3ByKey.get("jev::100::5")!;
  const bIdx = taskIndex(baseline100);
  const tIdx = taskIndex(top5_100);
  const ids = [...bIdx.keys()].sort();
  const successPairs = ids.map((id) => ({
    aSuccess: success(bIdx.get(id)!),
    bSuccess: success(tIdx.get(id)!),
  }));
  const esrPairs = ids.map((id) => ({
    a: success(bIdx.get(id)!) ? 1 : 0,
    b: success(tIdx.get(id)!) ? 1 : 0,
  }));
  const costPairs = ids.map((id) => ({
    a: bIdx.get(id)!.pricedCostUsd,
    b: tIdx.get(id)!.pricedCostUsd,
  }));
  const mcnemar = mcnemarExact(successPairs);
  const esrBoot = pairedBootstrapMeanDiff(esrPairs, { replicates, seed });
  const costBoot = pairedBootstrapMeanDiff(costPairs, { replicates, seed: seed + 1 });

  const n100Paired = {
    comparison: "M3 N=100 baseline vs Jev top-5",
    observed_delta_esr: esrBoot.observed_mean_diff,
    paired_bootstrap_ci95: { low: esrBoot.ci_low, high: esrBoot.ci_high },
    mcnemar,
    framing:
      "Observed ΔESR is small; discordances are nearly balanced; uncertainty is too large for an equivalence claim.",
    cost_paired_bootstrap: {
      observed_mean_diff: costBoot.observed_mean_diff,
      ci95: { low: costBoot.ci_low, high: costBoot.ci_high },
      note: costBoot.note,
    },
  };

  const kAblation = {
    toolspace_size: 100,
    rows: m4Tables.rows.map((r) => ({
      top_k: r.top_k,
      strict_recall_at_k: r.recall_at_k,
      lenient_recall_at_k: r.lenient_recall_at_k,
      execution_success_rate: r.execution_success_rate,
      selection_accuracy: r.selection_accuracy,
      priced_cost_usd_per_attempt:
        r.attempts === 0 ? null : r.priced_cost_usd / r.attempts,
      agent_tokens_mean:
        r.attempts === 0
          ? null
          : (r.agent_input_tokens + r.agent_output_tokens) / r.attempts,
    })),
    marginal_routing_utility: marginal,
    decision_rule: null,
  };

  const failureDecomposition = {
    rows: m4.directories
      .map((d) => {
        const tax = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, ok: 0 };
        for (const r of d.runs) {
          if (r.failureCode === null && r.executionSuccess) tax.ok += 1;
          else if (r.failureCode === "R1") tax.R1 += 1;
          else if (r.failureCode === "R2") tax.R2 += 1;
          else if (r.failureCode === "R3") tax.R3 += 1;
          else if (r.failureCode === "R4") tax.R4 += 1;
          else if (r.failureCode === "R5") tax.R5 += 1;
          else if (r.failureCode === "R6") tax.R6 += 1;
        }
        return { top_k: d.config.topK, ...tax, attempts: d.runs.length };
      })
      .sort((a, b) => (a.top_k ?? 0) - (b.top_k ?? 0)),
  };

  const frontierPoints = [
    ...["baseline", "jev"].flatMap((arch) => {
      const load =
        arch === "baseline"
          ? m3ByKey.get("baseline::100::null")
          : m3ByKey.get("jev::100::1");
      if (!load) return [];
      const scored = load.runs.filter((r) => !r.executionExcluded);
      const esr =
        scored.length === 0
          ? null
          : scored.filter((r) => r.executionSuccess).length / scored.length;
      const cost =
        load.runs.reduce((s, r) => s + r.pricedCostUsd, 0) / Math.max(1, load.runs.length);
      return [
        {
          label: cellLabel(load),
          source: "m3",
          esr,
          cost_per_attempt: cost,
        },
      ];
    }),
    {
      label: "jev_k5_n100",
      source: "m3",
      esr: (() => {
        const load = m3ByKey.get("jev::100::5")!;
        const scored = load.runs.filter((r) => !r.executionExcluded);
        return scored.filter((r) => r.executionSuccess).length / scored.length;
      })(),
      cost_per_attempt:
        top5_100.runs.reduce((s, r) => s + r.pricedCostUsd, 0) / top5_100.runs.length,
    },
    ...m4Tables.rows.map((r) => ({
      label: `m4_jev_k${r.top_k}_n100`,
      source: "m4",
      esr: r.execution_success_rate,
      cost_per_attempt: r.attempts === 0 ? null : r.priced_cost_usd / r.attempts,
    })),
  ];

  // M3↔M4 reproducibility for k=1 and k=5
  const repro = [1, 5].map((k) => {
    const m3dir = m3ByKey.get(`jev::100::${k}`)!;
    const m4dir = m4ByK.get(k)!;
    const a = taskIndex(m3dir);
    const b = taskIndex(m4dir);
    const taskIds = [...a.keys()].sort();
    let both_ok = 0;
    let both_fail = 0;
    let m3_only = 0;
    let m4_only = 0;
    const diffs: Array<Record<string, unknown>> = [];
    for (const id of taskIds) {
      const x = a.get(id)!;
      const y = b.get(id)!;
      const xs = success(x);
      const ys = success(y);
      if (xs && ys) both_ok += 1;
      else if (!xs && !ys) both_fail += 1;
      else if (xs && !ys) m3_only += 1;
      else m4_only += 1;
      if (xs !== ys || x.failureCode !== y.failureCode || x.recallAtK !== y.recallAtK) {
        diffs.push({
          taskId: id,
          m3: { success: xs, failureCode: x.failureCode, recallAtK: x.recallAtK },
          m4: { success: ys, failureCode: y.failureCode, recallAtK: y.recallAtK },
        });
      }
    }
    const esrM3 =
      m3dir.runs.filter((r) => !r.executionExcluded && r.executionSuccess).length /
      m3dir.runs.filter((r) => !r.executionExcluded).length;
    const esrM4 =
      m4dir.runs.filter((r) => !r.executionExcluded && r.executionSuccess).length /
      m4dir.runs.filter((r) => !r.executionExcluded).length;
    return {
      k,
      esr_m3: esrM3,
      esr_m4: esrM4,
      delta_esr: esrM4 - esrM3,
      contingency: { both_ok, both_fail, m3_only, m4_only },
      agreement_rate: (both_ok + both_fail) / taskIds.length,
      diffs,
    };
  });

  // Adaptive calibration failure summary from frozen adaptive summary if present
  let adaptivePanel: Record<string, unknown> = {
    manifest: adaptive.manifestPath,
    cells: adaptive.directories.map((d) => ({
      label: cellLabel(d),
      attempts: d.runs.length,
      esr:
        d.runs.filter((r) => !r.executionExcluded).length === 0
          ? null
          : d.runs.filter((r) => !r.executionExcluded && r.executionSuccess).length /
            d.runs.filter((r) => !r.executionExcluded).length,
    })),
  };
  const adaptiveSummaryPath = join(cwd, "analysis/adaptive/adaptive-summary.json");
  try {
    adaptivePanel = {
      ...adaptivePanel,
      frozen_summary: JSON.parse(readFileSync(adaptiveSummaryPath, "utf8")),
      holdout_note:
        "Confidence→k adaptive routing was a negative result on the first live holdout; no further threshold fitting (D13).",
    };
  } catch {
    adaptivePanel = {
      ...adaptivePanel,
      holdout_note:
        "Confidence→k adaptive routing was a negative result on the first live holdout; no further threshold fitting (D13).",
    };
  }

  const figures: Record<string, SynthesisFigureJson> = {
    "esr-vs-n": {
      id: "esr-vs-n",
      title: "Execution Success Rate vs toolspace size N",
      kind: "line",
      x_label: "N",
      y_label: "ESR",
      series: esrVsN.series.map((s) => ({
        name: s.architecture,
        points: s.points
          .filter((p) => p.esr !== null)
          .map((p) => ({ x: p.n, y: p.esr as number })),
      })),
    },
    "cost-vs-n": {
      id: "cost-vs-n",
      title: "Priced cost per attempt vs N",
      kind: "line",
      x_label: "N",
      y_label: "USD / attempt",
      series: costVsN.series.map((s) => ({
        name: s.architecture,
        points: s.points
          .filter((p) => p.cost_per_attempt !== null)
          .map((p) => ({ x: p.n, y: p.cost_per_attempt as number })),
      })),
    },
    "agent-tokens-vs-n": {
      id: "agent-tokens-vs-n",
      title: "Mean agent tokens vs N",
      kind: "line",
      x_label: "N",
      y_label: "Agent tokens / attempt",
      series: agentTokensVsN.series.map((s) => ({
        name: s.architecture,
        points: s.points
          .filter((p) => p.agent_tokens_mean !== null)
          .map((p) => ({ x: p.n, y: p.agent_tokens_mean as number })),
      })),
    },
    "k-ablation": {
      id: "k-ablation",
      title: "Recall / ESR / selection accuracy vs k at N=100 (M4)",
      kind: "line",
      x_label: "k",
      y_label: "Rate",
      series: [
        {
          name: "strict Recall@k",
          points: kAblation.rows
            .filter((r) => r.strict_recall_at_k !== null)
            .map((r) => ({ x: r.top_k, y: r.strict_recall_at_k as number })),
        },
        {
          name: "ESR",
          points: kAblation.rows
            .filter((r) => r.execution_success_rate !== null)
            .map((r) => ({ x: r.top_k, y: r.execution_success_rate as number })),
        },
        {
          name: "selection accuracy",
          points: kAblation.rows
            .filter((r) => r.selection_accuracy !== null)
            .map((r) => ({ x: r.top_k, y: r.selection_accuracy as number })),
        },
      ],
    },
    "failure-decomposition": {
      id: "failure-decomposition",
      title: "R1 / R2 failure counts vs k (M4, N=100)",
      kind: "grouped_bar",
      x_label: "k",
      y_label: "Count",
      categories: failureDecomposition.rows.map((r) => String(r.top_k)),
      groups: [
        { name: "R1", values: failureDecomposition.rows.map((r) => r.R1) },
        { name: "R2", values: failureDecomposition.rows.map((r) => r.R2) },
      ],
    },
    "cost-esr-frontier": {
      id: "cost-esr-frontier",
      title: "Cost vs ESR frontier (N=100)",
      kind: "scatter",
      x_label: "USD / attempt",
      y_label: "ESR",
      points: frontierPoints
        .filter((p) => p.esr !== null && p.cost_per_attempt !== null)
        .map((p) => ({
          x: p.cost_per_attempt as number,
          y: p.esr as number,
          label: p.label,
        })),
    },
    "reproducibility": {
      id: "reproducibility",
      title: "M3↔M4 reproducibility (k=1, k=5 at N=100)",
      kind: "table",
      columns: ["k", "ESR_M3", "ESR_M4", "ΔESR", "agreement"],
      rows: repro.map((r) => [
        String(r.k),
        r.esr_m3.toFixed(3),
        r.esr_m4.toFixed(3),
        r.delta_esr.toFixed(3),
        r.agreement_rate.toFixed(3),
      ]),
    },
    "adaptive-calibration": {
      id: "adaptive-calibration",
      title: "Adaptive holdout cells (negative confidence→k result)",
      kind: "grouped_bar",
      x_label: "Cell",
      y_label: "ESR",
      categories: (adaptivePanel.cells as Array<{ label: string; esr: number | null }>).map(
        (c) => c.label,
      ),
      groups: [
        {
          name: "ESR",
          values: (adaptivePanel.cells as Array<{ esr: number | null }>).map((c) => c.esr ?? 0),
        },
      ],
    },
  };

  return {
    version: 1,
    kind: "publication_synthesis",
    generated_at: new Date().toISOString(),
    sources: {
      m3_manifest: m3.manifestPath,
      m4_manifest: m4.manifestPath,
      adaptive_manifest: adaptive.manifestPath,
    },
    methodology: {
      paired_bootstrap: esrBoot.note,
      mcnemar: mcnemar.note,
      cost_uncertainty:
        "Paired bootstrap across the 78 benchmark tasks estimates uncertainty over this task sample, " +
        "not provider/run-to-run variance. Much of cost variation is mechanically task-dependent token usage.",
      latency:
        "Latency omitted from headline synthesis figures; M3↔M4 showed material epoch variation.",
      decision_rule: null,
    },
    panels: {
      esr_vs_n: esrVsN,
      cost_vs_n: costVsN,
      agent_tokens_vs_n: agentTokensVsN,
      n100_baseline_vs_top5: n100Paired,
      k_ablation: kAblation,
      failure_decomposition: failureDecomposition,
      cost_esr_frontier: { points: frontierPoints },
      reproducibility: repro,
      adaptive_calibration: adaptivePanel,
      m4_k_sweep_tables: m4Tables,
    },
    figures,
  };
}

export function writeSynthesis(options: SynthesisOptions = {}): {
  outDir: string;
  artifact: SynthesisArtifact;
} {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? "analysis/synthesis");
  const figuresDir = join(outDir, "figures");
  const renderedDir = join(outDir, "rendered");
  mkdirSync(figuresDir, { recursive: true });
  mkdirSync(renderedDir, { recursive: true });

  const artifact = buildSynthesis(options);
  writeFileSync(join(outDir, "synthesis.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(join(outDir, "synthesis.md"), renderSynthesisMarkdown(artifact));

  for (const [id, figure] of Object.entries(artifact.figures)) {
    writeFileSync(join(figuresDir, `${id}.json`), `${JSON.stringify(figure, null, 2)}\n`);
  }
  renderSynthesisSvgs(artifact.figures, renderedDir);

  return { outDir, artifact };
}

function renderSynthesisMarkdown(artifact: SynthesisArtifact): string {
  const n100 = artifact.panels.n100_baseline_vs_top5 as {
    observed_delta_esr: number;
    paired_bootstrap_ci95: { low: number; high: number };
    mcnemar: {
      a_only: number;
      b_only: number;
      exact_two_sided_p: number;
      both_success: number;
      both_failure: number;
    };
    framing: string;
  };
  const lines = [
    "# Publication synthesis (M3 + M4 + adaptive)",
    "",
    "Status: regenerable offline artifact. **No optimal-k. No equivalence claim.**",
    "",
    "## Sources",
    "",
    `- M3: \`${artifact.sources.m3_manifest}\``,
    `- M4: \`${artifact.sources.m4_manifest}\``,
    `- Adaptive: \`${artifact.sources.adaptive_manifest}\``,
    "",
    "## Dependency",
    "",
    "```text",
    "Frozen manifests → task-level analysis → synthesis.json → figure JSON → SVG",
    "```",
    "",
    "## Methodology notes",
    "",
    `- ${artifact.methodology.paired_bootstrap}`,
    `- ${artifact.methodology.mcnemar}`,
    `- ${artifact.methodology.cost_uncertainty}`,
    `- ${artifact.methodology.latency}`,
    "",
    "## Headline paired comparison (M3 N=100 baseline vs top-5)",
    "",
    `| Quantity | Value |`,
    `|---|---|`,
    `| Observed ΔESR (top-5 − baseline) | ${n100.observed_delta_esr.toFixed(4)} |`,
    `| Paired bootstrap 95% CI | [${n100.paired_bootstrap_ci95.low.toFixed(4)}, ${n100.paired_bootstrap_ci95.high.toFixed(4)}] |`,
    `| Discordant: baseline-only / top5-only | ${n100.mcnemar.a_only} / ${n100.mcnemar.b_only} |`,
    `| Both success / both failure | ${n100.mcnemar.both_success} / ${n100.mcnemar.both_failure} |`,
    `| McNemar exact two-sided p | ${n100.mcnemar.exact_two_sided_p.toFixed(4)} |`,
    "",
    `> ${n100.framing}`,
    "",
    "## Figures",
    "",
    "JSON under `figures/`; SVG under `rendered/`. JSON is canonical.",
    "",
    Object.keys(artifact.figures)
      .map((id) => `- \`${id}\``)
      .join("\n"),
    "",
    `Generated: ${artifact.generated_at}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}
