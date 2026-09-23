import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pricedCostUsd } from "../metrics/metrics.js";
import { loadPricingTable } from "./load.js";

const v1Path = fileURLToPath(new URL("../../pricing/v1.json", import.meta.url));

it("prices known token counts to a hand-computed USD amount from v1", () => {
  const table = loadPricingTable(v1Path);
  const agent = table.models["openai/gpt-5.6-sol"];
  const jev = table.models["typesafe/jev-1.13.0"];
  if (agent === undefined || jev === undefined) throw new Error("missing pinned models");

  // 250_000 agent input + 50_000 agent output + 1_000_000 jev input + 100 jev output
  // = 250_000/1e6 * 4 + 50_000/1e6 * 20 + 1_000_000/1e6 * 0.042 + 100/1e6 * 0
  // = 1 + 1 + 0.042 + 0
  // = 2.042
  const agentCost = pricedCostUsd({ inputTokens: 250_000, outputTokens: 50_000 }, agent);
  const jevCost = pricedCostUsd({ inputTokens: 1_000_000, outputTokens: 100 }, jev);
  expect(agentCost).toBe(2);
  expect(jevCost).toBe(0.042);
  expect(agentCost + jevCost).toBe(2.042);
  expect(jev.outputUsdPerMillion).toBe(0);
});

it("changes priced cost when the pricing file changes", () => {
  const root = mkdtempSync(join(tmpdir(), "jev-pricing-"));
  const path = join(root, "v2.json");
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: "v2",
        sourcedAt: "2026-09-23",
        sources: {
          "openai/gpt-5.6-sol": "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
        },
        models: {
          "openai/gpt-5.6-sol": { inputUsdPerMillion: 8, outputUsdPerMillion: 40 },
          "typesafe/jev-1.13.0": { inputUsdPerMillion: 0.042, outputUsdPerMillion: 0 },
        },
      },
      null,
      2,
    )}\n`,
  );
  const v1 = loadPricingTable(v1Path);
  const v2 = loadPricingTable(path);
  const usage = { inputTokens: 1_000_000, outputTokens: 0 };
  const agentV1 = v1.models["openai/gpt-5.6-sol"];
  const agentV2 = v2.models["openai/gpt-5.6-sol"];
  if (agentV1 === undefined || agentV2 === undefined) throw new Error("missing agent");
  expect(pricedCostUsd(usage, agentV1)).toBe(4);
  expect(pricedCostUsd(usage, agentV2)).toBe(8);
  expect(v1.version).toBe("v1");
  expect(v2.version).toBe("v2");
});
