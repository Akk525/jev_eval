import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildAnalysisDataset,
  loadAnalysisDirectory,
  type AnalysisDataset,
} from "./dataset.js";
import { discoverResultDirectories } from "./scaling-tables.js";
import { buildFigure1 } from "./figure1-esr.js";
import { buildFigure2Cost, buildFigure2Tokens } from "./figure2-cost-tokens.js";
import { buildFigure3 } from "./figure3-latency.js";
import { buildFigure4 } from "./figure4-recall.js";
import { buildFigure5 } from "./figure5-calibration.js";
import { buildFigure6 } from "./figure6-failures.js";

export interface AuditCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface ReproducibilityAuditReport {
  version: 1;
  audited_at: string;
  dataset_path: string | null;
  results_root: string | null;
  numbers_status: "unavailable" | "present";
  attempt_count: number;
  source_directories: number;
  checks: AuditCheck[];
  figures: Record<string, { ok: boolean; detail: string }>;
  /** true when every check and figure builder succeeded */
  pass: boolean;
  note: string;
}

export class ReproducibilityAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReproducibilityAuditError";
  }
}

const AUDIT_NOTE =
  "Pipeline regenerability audit for M6. Pass means figures rebuild from the analysis dataset (or results→dataset). It does not certify published numeric claims when numbers_status is unavailable.";

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new ReproducibilityAuditError(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

/**
 * Verify the M6 provenance chain regenerates without inventing numbers.
 */
export function runReproducibilityAudit(options: {
  dataset?: AnalysisDataset;
  datasetPath?: string;
  resultsRoot?: string;
  now?: () => Date;
}): ReproducibilityAuditReport {
  const now = options.now ?? (() => new Date());
  const checks: AuditCheck[] = [];
  let dataset = options.dataset;
  let datasetPath = options.datasetPath ?? null;
  let resultsRoot = options.resultsRoot ?? null;

  if (dataset === undefined && options.resultsRoot) {
    resultsRoot = resolve(options.resultsRoot);
    const dirs = discoverResultDirectories(resultsRoot);
    checks.push({
      id: "discover_result_dirs",
      ok: dirs.length > 0,
      detail: dirs.length > 0 ? `${dirs.length} result dir(s)` : `no result dirs under ${resultsRoot}`,
    });
    if (dirs.length === 0) {
      throw new ReproducibilityAuditError(
        `no result directories under ${resultsRoot}; cannot audit regeneration`,
      );
    }
    dataset = buildAnalysisDataset(resultsRoot, now);
    checks.push({
      id: "build_analysis_dataset",
      ok: true,
      detail: `${dataset.attempt_count} attempt(s), ${dataset.source_directories.length} source dir(s)`,
    });
    try {
      loadAnalysisDirectory(dirs[0]!);
      checks.push({ id: "spot_check_result_dir", ok: true, detail: dirs[0]! });
    } catch (error) {
      checks.push({
        id: "spot_check_result_dir",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (dataset === undefined && options.datasetPath) {
    datasetPath = resolve(options.datasetPath);
    dataset = loadAnalysisDatasetFile(datasetPath);
    checks.push({
      id: "load_analysis_dataset",
      ok: true,
      detail: datasetPath,
    });
  }

  if (dataset === undefined) {
    throw new ReproducibilityAuditError(
      "provide --dataset <analysis-dataset.json> or --results <dir> with at least one result directory",
    );
  }

  checks.push(...provenanceChecks(dataset));

  const figures: ReproducibilityAuditReport["figures"] = {};
  figures.figure1 = tryFigure(() => {
    const data = buildFigure1(dataset!);
    return `${data.series.length} series`;
  });
  figures.figure2 = tryFigure(() => {
    const cost = buildFigure2Cost(dataset!);
    const tokens = buildFigure2Tokens(dataset!);
    return `cost=${cost.series.length} series; tokens=${tokens.series.length} series`;
  });
  figures.figure3 = tryFigure(() => {
    const data = buildFigure3(dataset!);
    return `${data.series.length} series`;
  });
  figures.figure4 = tryFigure(() => {
    const data = buildFigure4(dataset!);
    return `${data.points.length} points / ${data.series.length} series`;
  });
  figures.figure5 = tryFigure(() => {
    const data = buildFigure5(dataset!);
    return `confidence_scored=${data.confidence.scored}; top1_scored=${data.top1_probability.scored}`;
  });
  figures.figure6 = tryFigure(() => {
    const data = buildFigure6(dataset!);
    return `${data.points.length} points; active=${data.active_codes.join("|") || "(none)"}`;
  });

  for (const [id, result] of Object.entries(figures)) {
    checks.push({ id: `figure_${id}`, ok: result.ok, detail: result.detail });
  }

  const numbers_status: ReproducibilityAuditReport["numbers_status"] =
    dataset.attempt_count > 0 ? "present" : "unavailable";

  const pass = checks.every((check) => check.ok);
  return {
    version: 1,
    audited_at: now().toISOString(),
    dataset_path: datasetPath,
    results_root: resultsRoot,
    numbers_status,
    attempt_count: dataset.attempt_count,
    source_directories: dataset.source_directories.length,
    checks,
    figures,
    pass,
    note: AUDIT_NOTE,
  };
}

export function writeReproducibilityAudit(
  report: ReproducibilityAuditReport,
  outDir: string,
): string {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const path = join(root, "reproducibility-audit.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

function provenanceChecks(dataset: AnalysisDataset): AuditCheck[] {
  const checks: AuditCheck[] = [];
  checks.push({
    id: "dataset_version",
    ok: dataset.version === 1,
    detail: `version=${dataset.version}`,
  });
  checks.push({
    id: "compatibility_key",
    ok:
      Boolean(dataset.compatibility.datasetVersion) &&
      Boolean(dataset.compatibility.registryHash) &&
      Boolean(dataset.compatibility.pricingVersion) &&
      Boolean(dataset.compatibility.agentModel),
    detail: JSON.stringify(dataset.compatibility),
  });
  checks.push({
    id: "m5_adaptive_tables_status",
    ok: dataset.m5_adaptive_tables === "skipped" || dataset.m5_adaptive_tables === "present",
    detail:
      dataset.m5_adaptive_tables === "present"
        ? "present — regenerate with npm run analysis:adaptive"
        : (dataset.m5_skip_reason ?? "skipped"),
  });

  if (dataset.attempts.length === 0) {
    checks.push({
      id: "attempts_nonempty",
      ok: false,
      detail: "analysis dataset has zero attempts — cannot regenerate figure numbers",
    });
    return checks;
  }

  const sample = dataset.attempts[0]!;
  const required = [
    "source_directory",
    "config_hash",
    "git_sha",
    "dataset_version",
    "registry_hash",
    "pricing_version",
  ] as const;
  const missing = required.filter((field) => {
    const value = sample[field];
    return value === undefined || value === null || value === "";
  });
  checks.push({
    id: "attempt_provenance_fields",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "ok" : `missing ${missing.join(",")}`,
  });
  return checks;
}

function tryFigure(run: () => string): { ok: boolean; detail: string } {
  try {
    return { ok: true, detail: run() };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
