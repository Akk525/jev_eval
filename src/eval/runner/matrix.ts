import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { enumerateMatrixCells, type MatrixCell } from "../../config/matrix.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import { resultTimestamp } from "./smoke.js";
import { runLiveSlice } from "./live.js";
import { runMockedSlice } from "./slice.js";

export type MatrixCellStatus = "pending" | "running" | "completed" | "failed";

export interface MatrixManifestCell {
  relativePath: string;
  architecture: string;
  toolspaceSize: number;
  status: MatrixCellStatus;
  directory: string | null;
  error: string | null;
}

export interface MatrixManifest {
  version: 1;
  timestamp: string;
  mock: boolean;
  cells: MatrixManifestCell[];
}

export interface MatrixCellReport {
  relativePath: string;
  status: MatrixCellStatus;
  directory: string | null;
  error: string | null;
}

export interface MatrixRunReport {
  timestamp: string;
  dryRun: boolean;
  mock: boolean;
  manifestPath: string | null;
  cells: MatrixCellReport[];
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
}

export interface MatrixCellRunArgs {
  cell: MatrixCell;
  configPath: string;
  resultsRoot: string;
  timestamp: string;
  resume: boolean;
  mock: boolean;
  tasks?: readonly BenchmarkTask[];
}

export interface MatrixOrchestratorOptions {
  resultsRoot: string;
  /** Defaults to process.cwd(). Used to resolve checked-in matrix config paths. */
  repoRoot?: string;
  dryRun?: boolean;
  /** Offline scripted routers/agent. Default false (live). */
  mock?: boolean;
  /**
   * Continue an interrupted matrix run. Completed cells are skipped.
   * Failed cells stay failed (no silent scientific retry).
   * Running/pending cells are attempted; partial result dirs use resume.
   */
  resume?: boolean;
  /** Matrix run id / shared result timestamp. Required to resume a specific run. */
  timestamp?: string;
  /** Restrict to these repo-relative config paths. */
  only?: readonly string[];
  /** Override the default 3 × 5 enumeration (tests / fixtures). */
  cells?: readonly MatrixCell[];
  /** Task subset passed to each cell runner (tests). */
  tasks?: readonly BenchmarkTask[];
  /** Injectable cell runner. Defaults to mocked or live slice. */
  runCell?: (args: MatrixCellRunArgs) => Promise<string>;
  /** Clock for new runs. */
  now?: () => Date;
  /**
   * Manifest subdirectory under resultsRoot. Default `_matrix`.
   * K-sweep uses `_k-sweep` so M3 and M4 manifests do not collide.
   */
  manifestDir?: string;
}

const DEFAULT_MANIFEST_DIR = "_matrix";

/**
 * Execute or plan the M3 N-matrix serially.
 * Per-cell result directories stay immutable; scientific retries are never silent.
 */
export async function runMatrix(options: MatrixOrchestratorOptions): Promise<MatrixRunReport> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const resultsRoot = resolve(options.resultsRoot);
  const manifestDir = options.manifestDir ?? DEFAULT_MANIFEST_DIR;
  const mock = options.mock === true;
  const dryRun = options.dryRun === true;
  const resume = options.resume === true;
  const catalog = options.cells ?? enumerateMatrixCells();
  const selected = selectCells(catalog, options.only);

  if (selected.length === 0) {
    throw new MatrixOrchestratorError("no matrix cells selected");
  }

  let manifest: MatrixManifest;
  let manifestPath: string | null = null;

  if (resume) {
    const loaded = loadManifestForResume(resultsRoot, manifestDir, options.timestamp);
    manifest = loaded.manifest;
    manifestPath = loaded.path;
    if (manifest.mock !== mock) {
      throw new MatrixOrchestratorError(
        `manifest mock=${manifest.mock} does not match --mock=${mock}; refusing to resume`,
      );
    }
    ensureOnlySubsetOfManifest(manifest, options.only);
  } else {
    if (options.timestamp !== undefined) {
      const existing = manifestFilePath(resultsRoot, manifestDir, options.timestamp);
      if (existsSync(existing)) {
        throw new MatrixOrchestratorError(
          `matrix manifest already exists at ${existing}; pass --resume to continue`,
        );
      }
    }
    const timestamp = options.timestamp ?? resultTimestamp(options.now?.() ?? new Date());
    manifest = {
      version: 1,
      timestamp,
      mock,
      cells: selected.map((cell) => ({
        relativePath: cell.relativePath,
        architecture: cell.architecture,
        toolspaceSize: cell.toolspaceSize,
        status: "pending",
        directory: null,
        error: null,
      })),
    };
    if (!dryRun) {
      manifestPath = writeManifest(resultsRoot, manifestDir, manifest);
    }
  }

  if (dryRun) {
    const planned = filterManifestCells(manifest, options.only);
    return {
      timestamp: manifest.timestamp,
      dryRun: true,
      mock,
      manifestPath,
      cells: planned.map((cell) => ({
        relativePath: cell.relativePath,
        status: cell.status,
        directory: cell.directory,
        error: cell.error,
      })),
      completed: planned.filter((c) => c.status === "completed").length,
      failed: planned.filter((c) => c.status === "failed").length,
      skipped: 0,
      pending: planned.filter((c) => c.status === "pending" || c.status === "running").length,
    };
  }

  const runCell = options.runCell ?? defaultRunCell;
  let skipped = 0;
  const worklist = filterManifestCells(manifest, options.only);

  for (const entry of worklist) {
    if (entry.status === "completed" || entry.status === "failed") {
      skipped += 1;
      continue;
    }

    const cell = resolveCell(entry.relativePath, catalog);
    const configPath = resolve(repoRoot, cell.relativePath);
    const shouldResume = entry.status === "running" || entry.directory !== null;
    entry.status = "running";
    entry.error = null;
    manifestPath = writeManifest(resultsRoot, manifestDir, manifest);

    try {
      const directory = await runCell({
        cell,
        configPath,
        resultsRoot,
        timestamp: manifest.timestamp,
        resume: shouldResume,
        mock,
        ...(options.tasks === undefined ? {} : { tasks: options.tasks }),
      });
      entry.status = "completed";
      entry.directory = directory;
      entry.error = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.status = "failed";
      entry.error = message;
      // Do not retry. Remaining cells still run so one failure does not hide others.
    }
    manifestPath = writeManifest(resultsRoot, manifestDir, manifest);
  }

  const report: MatrixRunReport = {
    timestamp: manifest.timestamp,
    dryRun: false,
    mock,
    manifestPath,
    cells: manifest.cells.map((cell) => ({
      relativePath: cell.relativePath,
      status: cell.status,
      directory: cell.directory,
      error: cell.error,
    })),
    completed: countStatus(manifest, "completed"),
    failed: countStatus(manifest, "failed"),
    skipped,
    pending: countStatus(manifest, "pending") + countStatus(manifest, "running"),
  };

  if (report.failed > 0) {
    throw new MatrixOrchestratorError(formatFailureSummary(report), report);
  }

  return report;
}

export class MatrixOrchestratorError extends Error {
  readonly report: MatrixRunReport | undefined;

  constructor(message: string, report?: MatrixRunReport) {
    super(message);
    this.name = "MatrixOrchestratorError";
    this.report = report;
  }
}

export function listMatrixManifests(resultsRoot: string, manifestDir = DEFAULT_MANIFEST_DIR): string[] {
  const root = join(resolve(resultsRoot), manifestDir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

function defaultRunCell(args: MatrixCellRunArgs): Promise<string> {
  const base = {
    configPath: args.configPath,
    resultsRoot: args.resultsRoot,
    timestamp: args.timestamp,
    resume: args.resume,
    ...(args.tasks === undefined ? {} : { tasks: args.tasks }),
  };
  return args.mock ? runMockedSlice(base) : runLiveSlice(base);
}

function selectCells(cells: readonly MatrixCell[], only: readonly string[] | undefined): MatrixCell[] {
  if (only === undefined || only.length === 0) return [...cells];
  const wanted = new Set(only);
  const selected = cells.filter((cell) => wanted.has(cell.relativePath));
  const missing = [...wanted].filter((path) => !selected.some((cell) => cell.relativePath === path));
  if (missing.length > 0) {
    throw new MatrixOrchestratorError(`unknown matrix config(s): ${missing.join(", ")}`);
  }
  return selected;
}

function ensureOnlySubsetOfManifest(manifest: MatrixManifest, only: readonly string[] | undefined): void {
  if (only === undefined || only.length === 0) return;
  const known = new Set(manifest.cells.map((cell) => cell.relativePath));
  const missing = only.filter((path) => !known.has(path));
  if (missing.length > 0) {
    throw new MatrixOrchestratorError(`--only not in matrix manifest: ${missing.join(", ")}`);
  }
}

function filterManifestCells(
  manifest: MatrixManifest,
  only: readonly string[] | undefined,
): MatrixManifestCell[] {
  if (only === undefined || only.length === 0) return manifest.cells;
  const wanted = new Set(only);
  return manifest.cells.filter((cell) => wanted.has(cell.relativePath));
}

function resolveCell(relativePath: string, catalog: readonly MatrixCell[]): MatrixCell {
  const found = catalog.find((cell) => cell.relativePath === relativePath);
  if (found === undefined) {
    throw new MatrixOrchestratorError(`matrix cell not in catalog: ${relativePath}`);
  }
  return found;
}

function loadManifestForResume(
  resultsRoot: string,
  manifestDir: string,
  timestamp: string | undefined,
): { manifest: MatrixManifest; path: string } {
  const id =
    timestamp ??
    listMatrixManifests(resultsRoot, manifestDir)
      .reverse()
      .find((name) => {
        const manifest = readManifest(manifestFilePath(resultsRoot, manifestDir, name));
        return manifest.cells.some((cell) => cell.status === "pending" || cell.status === "running");
      });

  if (id === undefined) {
    throw new MatrixOrchestratorError(
      "no resumable matrix manifest found; start a new run without --resume",
    );
  }

  const path = manifestFilePath(resultsRoot, manifestDir, id);
  if (!existsSync(path)) {
    throw new MatrixOrchestratorError(`matrix manifest not found: ${path}`);
  }
  return { manifest: readManifest(path), path };
}

function manifestFilePath(resultsRoot: string, manifestDir: string, timestamp: string): string {
  return join(resolve(resultsRoot), manifestDir, `${timestamp}.json`);
}

function writeManifest(resultsRoot: string, manifestDir: string, manifest: MatrixManifest): string {
  const path = manifestFilePath(resultsRoot, manifestDir, manifest.timestamp);
  mkdirSync(join(resolve(resultsRoot), manifestDir), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

function readManifest(path: string): MatrixManifest {
  const raw = JSON.parse(readFileSync(path, "utf8")) as MatrixManifest;
  if (raw.version !== 1 || typeof raw.timestamp !== "string" || !Array.isArray(raw.cells)) {
    throw new MatrixOrchestratorError(`invalid matrix manifest: ${path}`);
  }
  return raw;
}

function countStatus(manifest: MatrixManifest, status: MatrixCellStatus): number {
  return manifest.cells.filter((cell) => cell.status === status).length;
}

function formatFailureSummary(report: MatrixRunReport): string {
  const lines = report.cells
    .filter((cell) => cell.status === "failed")
    .map((cell) => `- ${cell.relativePath}: ${cell.error ?? "unknown error"}`);
  return `matrix run failed for ${report.failed} cell(s):\n${lines.join("\n")}`;
}
