import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface CalibrationDirReport {
  directory: string;
  architecture: string | null;
  calibration_scored: number;
  distinct_confidence_values: number;
  ok: boolean;
  reasons: string[];
}

export interface CalibrationCheckResult {
  resultsRoot: string;
  directories: CalibrationDirReport[];
  usable: CalibrationDirReport[];
  ready_for_threshold_lock: boolean;
}

/**
 * Find result dirs that can support adaptive-policy threshold selection.
 * Constant-confidence mocks are reported but not "usable".
 */
export function checkCalibrationBearingDirs(resultsRoot: string): CalibrationCheckResult {
  const root = resolve(resultsRoot);
  const directories: CalibrationDirReport[] = [];
  if (!existsSync(root)) {
    return { resultsRoot: root, directories, usable: [], ready_for_threshold_lock: false };
  }

  for (const name of readdirSync(root).sort()) {
    const directory = join(root, name);
    if (!statSync(directory).isDirectory()) continue;
    if (name.startsWith("_")) continue;
    const configPath = join(directory, "config.json");
    const runsPath = join(directory, "runs.jsonl");
    const summaryPath = join(directory, "summary.json");
    if (!existsSync(configPath) || !existsSync(runsPath)) continue;

    const config = JSON.parse(readFileSync(configPath, "utf8")) as { architecture?: string };
    const summary = existsSync(summaryPath)
      ? (JSON.parse(readFileSync(summaryPath, "utf8")) as {
          calibration?: { scored?: number };
        })
      : {};
    const scoredFromSummary = summary.calibration?.scored ?? 0;
    const confidences = readConfidences(runsPath);
    const distinct = new Set(confidences.map((value) => value.toFixed(6))).size;
    const reasons: string[] = [];
    if (config.architecture !== "jev") reasons.push("architecture is not jev");
    if (confidences.length === 0) {
      reasons.push("no calibration-scored attempts with confidence");
    } else if (distinct < 2) {
      reasons.push("confidence is constant across scored attempts");
    }

    const calibration_scored = scoredFromSummary > 0 ? scoredFromSummary : confidences.length;
    const ok = config.architecture === "jev" && confidences.length > 0 && distinct >= 2;

    directories.push({
      directory,
      architecture: config.architecture ?? null,
      calibration_scored,
      distinct_confidence_values: distinct,
      ok,
      reasons,
    });
  }

  const usable = directories.filter((dir) => dir.ok);
  return {
    resultsRoot: root,
    directories,
    usable,
    ready_for_threshold_lock: usable.length > 0,
  };
}

function readConfidences(runsPath: string): number[] {
  const values: number[] = [];
  for (const line of readFileSync(runsPath, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line) as {
      confidence?: number | null;
      routingExcluded?: boolean;
      recallAtK?: number | null;
    };
    if (row.routingExcluded) continue;
    if (row.confidence === null || row.confidence === undefined) continue;
    if (row.recallAtK === null || row.recallAtK === undefined) continue;
    values.push(row.confidence);
  }
  return values;
}
