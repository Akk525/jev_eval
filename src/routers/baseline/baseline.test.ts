import { expect, it } from "vitest";
import { createSmokeRegistry } from "../../tools/smoke.js";
import { createBaselineRouter } from "./baseline.js";

it("returns the presented toolspace in order with null scores and zero usage", async () => {
  const tools = createSmokeRegistry().list();
  const decision = await createBaselineRouter().route({
    taskPrompt: "unused",
    tools,
    k: 1,
  });

  expect(decision.candidates.map((candidate) => candidate.name)).toEqual(tools.map((tool) => tool.name));
  expect(decision.candidates).toHaveLength(5);
  expect(decision.candidates.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4, 5]);
  expect(decision.candidates.every((candidate) => candidate.score === null)).toBe(true);
  expect(decision.scores).toBeNull();
  expect(decision.top1Probability).toBeNull();
  expect(decision.confidence).toBeNull();
  expect(decision.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  expect(decision.latencyMs).toBe(0);
  expect(decision.raw).toBeNull();
});
