import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enumerateDressRehearsalCells } from "../../config/dress-rehearsal.js";
import type { BenchmarkTask } from "../../dataset/schema.js";
import {
  runDressRehearsal,
  selectDressRehearsalTasks,
} from "./dress-rehearsal.js";

function task(id: string): BenchmarkTask {
  return {
    id,
    version: "0.2",
    difficulty: "easy",
    prompt: `p-${id}`,
    required_tools: ["read_email"],
    acceptable_tools: [],
    expected_sequence: ["read_email"],
    domains: ["email"],
    metadata: {},
    expected_arguments: {},
  };
}

describe("selectDressRehearsalTasks", () => {
  it("takes the first 50 by ascending id", () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      task(`task_${String(i + 1).padStart(4, "0")}`),
    );
    const subset = selectDressRehearsalTasks(tasks.reverse());
    expect(subset).toHaveLength(50);
    expect(subset[0]?.id).toBe("task_0001");
    expect(subset[49]?.id).toBe("task_0050");
  });
});

describe("runDressRehearsal", () => {
  it("records task_subset on the manifest and runs 9 cells", async () => {
    const root = mkdtempSync(join(tmpdir(), "dress-rehearsal-"));
    const tasks = Array.from({ length: 3 }, (_, i) =>
      task(`task_${String(i + 1).padStart(4, "0")}`),
    );
    const report = await runDressRehearsal({
      resultsRoot: root,
      mock: true,
      tasks,
      taskFilter: (all) => [...all],
      cells: enumerateDressRehearsalCells().slice(0, 2),
      runCell: async ({ cell, timestamp }) =>
        join(root, `${timestamp}_${cell.architecture}_n${cell.toolspaceSize}`),
    });

    expect(report.completed).toBe(2);
    expect(report.task_subset.task_count).toBe(50);
    expect(report.manifestPath).not.toBeNull();
    const manifest = JSON.parse(readFileSync(report.manifestPath!, "utf8")) as {
      task_subset: { task_ids_sample: string[] };
    };
    expect(manifest.task_subset.task_ids_sample).toEqual([
      "task_0001",
      "task_0002",
      "task_0003",
    ]);
  });
});
