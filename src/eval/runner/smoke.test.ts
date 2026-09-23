import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

it("runs the smoke config offline and records a perfect execution success rate", () => {
  const resultsRoot = mkdtempSync(join(tmpdir(), "jev-smoke-"));
  const run = spawnSync(
    "node_modules/.bin/tsx",
    ["src/cli/eval.ts", "--config", "configs/smoke.yaml", "--results", resultsRoot],
    { cwd: repoRoot, encoding: "utf8" },
  );

  expect(run.status, run.stderr).toBe(0);
  const directories = readdirSync(resultsRoot);
  expect(directories).toHaveLength(1);
  const directory = join(resultsRoot, directories[0] ?? "");
  const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8")) as {
    attempts: number;
    r0_attempts: number;
    execution_success_rate: number;
  };
  const runs = readFileSync(join(directory, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { toolspace: string[] });

  expect(summary).toMatchObject({ attempts: 5, r0_attempts: 0, execution_success_rate: 1 });
  expect(runs).toHaveLength(5);
  for (const record of runs) expect(record.toolspace).toHaveLength(5);
}, 20_000);
