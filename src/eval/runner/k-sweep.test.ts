import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildKSweepConfig, enumerateKSweepCells, type KSweepCell } from "../../config/k-sweep.js";
import { runKSweep } from "./k-sweep.js";
import type { MatrixCellRunArgs } from "./matrix.js";

function fixtureCells(): KSweepCell[] {
  return [
    {
      topK: 1,
      relativePath: "configs/k-sweep/jev-top1-n25.yaml",
      config: buildKSweepConfig(1),
    },
    {
      topK: 3,
      relativePath: "configs/k-sweep/jev-top3-n25.yaml",
      config: buildKSweepConfig(3),
    },
  ];
}

describe("runKSweep", () => {
  it("dry-runs the full k ∈ {1,3,5,10} enumeration", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ksweep-dry-"));
    const report = await runKSweep({
      resultsRoot: root,
      dryRun: true,
      mock: true,
      timestamp: "2026-09-24T120000Z",
    });
    expect(report.cells).toHaveLength(4);
    expect(report.cells.map((cell) => cell.relativePath)).toEqual(
      enumerateKSweepCells().map((cell) => cell.relativePath),
    );
    expect(report.manifestPath).toBeNull();
  });

  it("writes a _k-sweep manifest and skips completed cells on resume", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ksweep-run-"));
    const timestamp = "2026-09-24T120102Z";
    const calls: string[] = [];
    let failSecond = true;

    const runCell = async (args: MatrixCellRunArgs): Promise<string> => {
      calls.push(args.cell.relativePath);
      if (failSecond && args.cell.config.topK === 3) throw new Error("provider down");
      const directory = join(root, `${args.timestamp}_jev_n25_k${args.cell.config.topK}_done`);
      writeFileSync(join(root, `k${args.cell.config.topK}.marker`), args.resume ? "resume" : "fresh");
      return directory;
    };

    await expect(
      runKSweep({
        resultsRoot: root,
        mock: true,
        timestamp,
        cells: fixtureCells(),
        runCell,
      }),
    ).rejects.toThrow(/matrix run failed/);

    expect(calls).toEqual([
      "configs/k-sweep/jev-top1-n25.yaml",
      "configs/k-sweep/jev-top3-n25.yaml",
    ]);

    const manifestPath = join(root, "_k-sweep", `${timestamp}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.cells[0].status).toBe("completed");
    expect(manifest.cells[1].status).toBe("failed");

    failSecond = false;
    calls.length = 0;
    manifest.cells[1] = {
      ...manifest.cells[1],
      status: "running",
      directory: join(root, `${timestamp}_jev_partial`),
      error: null,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const resumed = await runKSweep({
      resultsRoot: root,
      mock: true,
      resume: true,
      timestamp,
      cells: fixtureCells(),
      runCell,
    });
    expect(calls).toEqual(["configs/k-sweep/jev-top3-n25.yaml"]);
    expect(resumed.completed).toBe(2);
    expect(resumed.skipped).toBe(1);
  });
});
