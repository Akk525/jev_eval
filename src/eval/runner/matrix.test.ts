import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMatrixConfig, type MatrixCell } from "../../config/matrix.js";
import {
  MatrixOrchestratorError,
  runMatrix,
  type MatrixCellRunArgs,
  type MatrixManifest,
} from "./matrix.js";

function fixtureCells(): MatrixCell[] {
  return [
    {
      id: "baseline",
      architecture: "baseline",
      toolspaceSize: 5,
      relativePath: "configs/matrix/baseline-n5.yaml",
      config: buildMatrixConfig("baseline", 5),
    },
    {
      id: "jev_top5",
      architecture: "jev",
      toolspaceSize: 5,
      relativePath: "configs/matrix/jev-top5-n5.yaml",
      config: buildMatrixConfig("jev_top5", 5),
    },
  ];
}

describe("runMatrix", () => {
  it("dry-runs the full 3 × 5 enumeration without writing a manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-matrix-dry-"));
    const report = await runMatrix({
      resultsRoot: root,
      dryRun: true,
      mock: true,
      timestamp: "2026-09-24T000000Z",
    });
    expect(report.dryRun).toBe(true);
    expect(report.cells).toHaveLength(15);
    expect(report.cells.map((c) => c.relativePath)).toEqual([
      "configs/matrix/baseline-n5.yaml",
      "configs/matrix/baseline-n10.yaml",
      "configs/matrix/baseline-n25.yaml",
      "configs/matrix/baseline-n50.yaml",
      "configs/matrix/baseline-n100.yaml",
      "configs/matrix/jev-top1-n5.yaml",
      "configs/matrix/jev-top1-n10.yaml",
      "configs/matrix/jev-top1-n25.yaml",
      "configs/matrix/jev-top1-n50.yaml",
      "configs/matrix/jev-top1-n100.yaml",
      "configs/matrix/jev-top5-n5.yaml",
      "configs/matrix/jev-top5-n10.yaml",
      "configs/matrix/jev-top5-n25.yaml",
      "configs/matrix/jev-top5-n50.yaml",
      "configs/matrix/jev-top5-n100.yaml",
    ]);
    expect(report.manifestPath).toBeNull();
    expect(report.pending).toBe(15);
  });

  it("resumes after interruption without rewriting a completed cell", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-matrix-resume-"));
    const cells = fixtureCells();
    const timestamp = "2026-09-24T010203Z";
    const calls: string[] = [];
    let blowUpSecond = true;

    const runCell = async (args: MatrixCellRunArgs): Promise<string> => {
      calls.push(args.cell.relativePath);
      if (blowUpSecond && args.cell.relativePath.endsWith("jev-top5-n5.yaml")) {
        throw new Error("provider down");
      }
      const directory = join(root, `${args.timestamp}_${args.cell.architecture}_done`);
      writeFileSync(join(root, `${args.cell.architecture}.marker`), args.resume ? "resume" : "fresh");
      return directory;
    };

    await expect(
      runMatrix({
        resultsRoot: root,
        mock: true,
        timestamp,
        cells,
        runCell,
      }),
    ).rejects.toBeInstanceOf(MatrixOrchestratorError);

    expect(calls).toEqual([
      "configs/matrix/baseline-n5.yaml",
      "configs/matrix/jev-top5-n5.yaml",
    ]);

    const manifestPath = join(root, "_matrix", `${timestamp}.json`);
    const afterFail = JSON.parse(readFileSync(manifestPath, "utf8")) as MatrixManifest;
    expect(afterFail.cells[0]?.status).toBe("completed");
    expect(afterFail.cells[0]?.directory).toContain("baseline_done");
    expect(afterFail.cells[1]?.status).toBe("failed");
    expect(afterFail.cells[1]?.error).toContain("provider down");

    const baselineDir = afterFail.cells[0]?.directory;
    blowUpSecond = false;
    calls.length = 0;

    afterFail.cells[1] = {
      ...afterFail.cells[1]!,
      status: "running",
      directory: join(root, `${timestamp}_jev_partial`),
      error: null,
    };
    writeFileSync(manifestPath, `${JSON.stringify(afterFail, null, 2)}\n`);

    const resumed = await runMatrix({
      resultsRoot: root,
      mock: true,
      resume: true,
      timestamp,
      cells,
      runCell,
    });

    expect(calls).toEqual(["configs/matrix/jev-top5-n5.yaml"]);
    expect(resumed.completed).toBe(2);
    expect(resumed.failed).toBe(0);
    expect(resumed.skipped).toBe(1);
    expect(resumed.cells[0]?.directory).toBe(baselineDir);
    expect(readFileSync(join(root, "jev.marker"), "utf8")).toBe("resume");
    expect(readFileSync(join(root, "baseline.marker"), "utf8")).toBe("fresh");
  });

  it("does not silently retry a failed cell on resume", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-matrix-noretry-"));
    const cells = fixtureCells();
    const timestamp = "2026-09-24T030405Z";
    const calls: string[] = [];

    await expect(
      runMatrix({
        resultsRoot: root,
        mock: true,
        timestamp,
        cells,
        runCell: async (args) => {
          calls.push(args.cell.relativePath);
          throw new Error(`fail ${args.cell.architecture}`);
        },
      }),
    ).rejects.toThrow(/matrix run failed/);

    calls.length = 0;
    await expect(
      runMatrix({
        resultsRoot: root,
        mock: true,
        resume: true,
        timestamp,
        cells,
        runCell: async (args) => {
          calls.push(args.cell.relativePath);
          return join(root, args.cell.architecture);
        },
      }),
    ).rejects.toThrow(/matrix run failed/);

    expect(calls).toEqual([]);
  });

  it("still allows a single matrix cell via --only", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-matrix-only-"));
    const report = await runMatrix({
      resultsRoot: root,
      mock: true,
      dryRun: true,
      only: ["configs/matrix/jev-top1-n50.yaml"],
    });
    expect(report.cells).toHaveLength(1);
    expect(report.cells[0]?.relativePath).toBe("configs/matrix/jev-top1-n50.yaml");
  });
});
