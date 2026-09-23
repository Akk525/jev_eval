import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLiveSlice } from "./live.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

it("refuses a live run when AGENT_API_KEY is missing", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/baseline-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: {},
    }),
  ).rejects.toThrow(/AGENT_API_KEY/);
});

it("refuses a live Jev run when TYPESAFE_API_KEY is missing", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: { AGENT_API_KEY: "sk-test" },
    }),
  ).rejects.toThrow(/TYPESAFE_API_KEY/);
});

it("does not require AGENT_API_KEY for a live router-only Jev run", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/jev-router-only-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: {},
    }),
  ).rejects.toThrow(/TYPESAFE_API_KEY/);
});
