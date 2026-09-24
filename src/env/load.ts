import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface LoadEnvOptions {
  /** Starting directory (default: process.cwd()). Walks upward looking for `.env`. */
  cwd?: string;
  /** Target env object (default: process.env). Existing keys are never overwritten. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Load KEY=VALUE pairs from the nearest `.env` into `process.env`.
 * Does not override variables already set in the environment.
 * Returns the path loaded, or null if none found.
 */
export function loadDotEnv(options: LoadEnvOptions = {}): string | null {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const path = findDotEnv(cwd);
  if (path === null) return null;

  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1]!;
    let value = match[2]!;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.trim();
    }
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
    }
  }
  return path;
}

function findDotEnv(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
