import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildKSweepConfig, enumerateKSweepCells, type KSweepCell } from "../../config/k-sweep.js";
import { runKSweep } from "./k-sweep.js";
import type { MatrixCellRunArgs, MatrixManifest } from "./matrix.js";

function fixtureCells(): KSweepCell[] {
  return [
    {
      id: "jev_k1_n100",
      topK: 1,
      relativePath: "configs/k-sweep/jev-top1-n100.yaml",
      config: buildKSweepConfig(1),
    },
    {
      id: "jev_k3_n100",
      topK: 3,
      relativePath: "configs/k-sweep/jev-top3-n100.yaml",
      config: buildKSweepConfig(3),
    },
  ];
}

describe("runKSweep", () => {
  it("dry-runs the four N=100 cells", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ksweep-dry-"));
    const report = await runKSweep({
      resultsRoot: root,
      dryRun: true,
      mock: true,
      timestamp: "2026-09-24T120000Z",
    });
    expect(report.cells).toHaveLength(4);
    expect(report.cells.map((c) => c.relativePath)).toEqual(
      enumerateKSweepCells().map((c) => c.relativePath),
    );
  });

  it("writes a _k-sweep manifest and skips completed cells on resume", async () => {
    const root = mkdtempSync(join(tmpdir(), "jev-ksweep-resume-"));
    const cells = fixtureCells();
    const timestamp = "2026-09-24T120102Z";
    const calls: string[] = [];
    let blowSecond = true;

    const runCell = async (args: MatrixCellRunArgs): Promise<string> => {
      calls.push(args.cell.relativePath);
      if (blowSecond && args.cell.relativePath.endsWith("jev-top3-n100.yaml")) {
        throw new Error("provider down");
      }
      return join(root, `${args.timestamp}_jev_n100_k${args.cell.config.topK}_done`);
    };

    await expect(
      runKSweep({
        resultsRoot: root,
        mock: true,
        timestamp,
        cells,
        runCell,
      }),
    ).rejects.toThrow(/matrix run failed/);

    expect(calls).toEqual([
      "configs/k-sweep/jev-top1-n100.yaml",
      "configs/k-sweep/jev-top3-n100.yaml",
    ]);

    const manifestPath = join(root, "_k-sweep", `${timestamp}.json`);
    const afterFail = JSON.parse(readFileSync(manifestPath, "utf8")) as MatrixManifest;
    expect(afterFail.cells[0]?.status).toBe("completed");
    expect(afterFail.cells[1]?.status).toBe("failed");

    const firstDir = afterFail.cells[0]?.directory;
    blowSecond = false;
    calls.length = 0;
    afterFail.cells[1] = {
      ...afterFail.cells[1]!,
      status: "running",
      directory: join(root, `${timestamp}_partial`),
      error: null,
    };
    writeFileSync(manifestPath, `${JSON.stringify(afterFail, null, 2)}\n`);

    const resumed = await runKSweep({
      resultsRoot: root,
      mock: true,
      resume: true,
      timestamp,
      cells,
      runCell,
    });

    expect(calls).toEqual(["configs/k-sweep/jev-top3-n100.yaml"]);
    expect(resumed.completed).toBe(2);
    expect(resumed.skipped).toBe(1);
    expect(resumed.cells[0]?.directory).toBe(firstDir);
  });
});
