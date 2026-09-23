import { expect, it } from "vitest";
import { createToolRegistry } from "./registry.js";
import { sampleLookup, sampleStore } from "./samples.js";

function registered() {
  const registry = createToolRegistry(["sample_store", "sample_lookup"]);
  registry.register(sampleLookup);
  registry.register(sampleStore);
  return registry;
}

it("executes a tool deterministically", () => {
  const registry = registered();
  const first = registry.execute("sample_lookup", { query: "sarah" }, {});
  const second = registry.execute("sample_lookup", { query: "sarah" }, {});
  expect(first).toEqual(second);
  expect(first.success).toBe(true);
});

it("returns success false for an unknown tool", () => {
  const result = registered().execute("missing", {}, {});
  expect(result).toEqual({ success: false, error: "unknown tool: missing", latencyMs: 0 });
});

it("changes the registry hash when routingSummary changes", () => {
  const before = registered().hash();
  const registry = createToolRegistry(["sample_store", "sample_lookup"]);
  registry.register({
    ...sampleLookup,
    definition: { ...sampleLookup.definition, routingSummary: "A different summary." },
  });
  registry.register(sampleStore);
  expect(registry.hash()).not.toBe(before);
});

it("ignores parameter key order in the registry hash", () => {
  const left = createToolRegistry(["sample_lookup"]);
  const right = createToolRegistry(["sample_lookup"]);
  left.register({
    ...sampleLookup,
    definition: { ...sampleLookup.definition, parameters: { b: 1, a: 2 } },
  });
  right.register({
    ...sampleLookup,
    definition: { ...sampleLookup.definition, parameters: { a: 2, b: 1 } },
  });
  expect(left.hash()).toBe(right.hash());
});
