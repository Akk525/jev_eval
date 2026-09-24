import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  loadResultDirectory,
  type ResultDirectoryLoad,
} from "./scaling-tables.js";

export class ManifestScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestScopeError";
  }
}

/** Shared shape for `_matrix` / `_k-sweep` / `_adaptive-eval` epoch manifests. */
export interface EpochManifestCell {
  relativePath: string;
  status: string;
  directory: string | null;
  error: string | null;
}

export interface EpochManifest {
  version: number;
  timestamp: string;
  mock?: boolean;
  cells: EpochManifestCell[];
}

export interface ManifestScopedLoads {
  manifestPath: string;
  timestamp: string;
  directories: ResultDirectoryLoad[];
}

/**
 * Load completed cell directories listed in an epoch manifest.
 * Never scans a results root. Absolute or repo-relative directory paths are resolved
 * relative to `cwd` when not absolute.
 */
export function loadCompletedCellsFromManifest(
  manifestPath: string,
  options: { cwd?: string } = {},
): ManifestScopedLoads {
  const cwd = options.cwd ?? process.cwd();
  const absoluteManifest = resolve(cwd, manifestPath);
  if (!existsSync(absoluteManifest)) {
    throw new ManifestScopeError(`manifest not found: ${absoluteManifest}`);
  }

  const raw = JSON.parse(readFileSync(absoluteManifest, "utf8")) as EpochManifest;
  if (!Array.isArray(raw.cells)) {
    throw new ManifestScopeError(`manifest missing cells array: ${absoluteManifest}`);
  }

  const directories: ResultDirectoryLoad[] = [];
  for (const cell of raw.cells) {
    if (cell.status !== "completed") {
      throw new ManifestScopeError(
        `manifest ${absoluteManifest}: cell ${cell.relativePath} status=${cell.status} (require all completed)`,
      );
    }
    if (cell.directory === null || cell.directory === "") {
      throw new ManifestScopeError(
        `manifest ${absoluteManifest}: cell ${cell.relativePath} has null directory`,
      );
    }
    const directory = isAbsolute(cell.directory) ? cell.directory : resolve(cwd, cell.directory);
    if (!existsSync(directory)) {
      throw new ManifestScopeError(
        `manifest ${absoluteManifest}: directory missing for ${cell.relativePath}: ${directory}`,
      );
    }
    directories.push(loadResultDirectory(directory));
  }

  if (directories.length === 0) {
    throw new ManifestScopeError(`manifest has no completed cells: ${absoluteManifest}`);
  }

  return {
    manifestPath: absoluteManifest,
    timestamp: raw.timestamp,
    directories,
  };
}

/**
 * Refuse silent multi-epoch scans. Analysis CLIs must pass --manifest.
 */
export function refuseResultsRootScan(context: string): never {
  throw new ManifestScopeError(
    `${context}: refusing to scan a results root. ` +
      "Pass --manifest <results/_matrix| _k-sweep| _adaptive-eval>/<timestamp>.json " +
      "so only that epoch's completed cell directories are loaded. " +
      "(Scanning results/ can silently merge immutable M3 and M4 dirs.)",
  );
}
