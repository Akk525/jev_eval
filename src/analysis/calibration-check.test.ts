import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCalibrationBearingDirs } from "./calibration-check.js";

function writeDir(
  root: string,
  name: string,
  opts: {
    architecture: string;
    confidences: number[];
    recall?: number;
  },
): void {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "config.json"),
    `${JSON.stringify({ architecture: opts.architecture, toolspaceSize: 25, topK: 5 }, null, 2)}\n`,
  );
  const runs = opts.confidences.map((confidence, index) =>
    JSON.stringify({
      taskId: `t${index}`,
      repetition: 0,
      routingExcluded: false,
      executionExcluded: false,
      confidence,
      recallAtK: opts.recall ?? 1,
      failureCode: null,
    }),
  );
  writeFileSync(join(directory, "runs.jsonl"), `${runs.join("\n")}\n`);
  writeFileSync(
    join(directory, "summary.json"),
    `${JSON.stringify({ calibration: { scored: opts.confidences.length } }, null, 2)}\n`,
  );
}

describe("checkCalibrationBearingDirs", () => {
  it("rejects empty roots and constant-confidence mocks", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-cal-empty-"));
    expect(checkCalibrationBearingDirs(root).ready_for_threshold_lock).toBe(false);

    writeDir(root, "const-jev", { architecture: "jev", confidences: [0.35, 0.35, 0.35] });
    const report = checkCalibrationBearingDirs(root);
    expect(report.directories).toHaveLength(1);
    expect(report.directories[0]!.ok).toBe(false);
    expect(report.directories[0]!.reasons.join(" ")).toMatch(/constant/);
    expect(report.ready_for_threshold_lock).toBe(false);
  });

  it("accepts a Jev dir with varying confidence and scored calibration", () => {
    const root = mkdtempSync(join(tmpdir(), "jev-cal-ok-"));
    writeDir(root, "live-jev", {
      architecture: "jev",
      confidences: [0.2, 0.55, 0.9, 0.4],
    });
    writeDir(root, "baseline", { architecture: "baseline", confidences: [] });
    const report = checkCalibrationBearingDirs(root);
    expect(report.usable).toHaveLength(1);
    expect(report.usable[0]!.directory).toContain("live-jev");
    expect(report.ready_for_threshold_lock).toBe(true);
  });
});
