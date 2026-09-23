import type { ToolImplementation } from "./registry.js";

export const sampleLookup: ToolImplementation = {
  definition: {
    name: "sample_lookup",
    description: "Look up a sample record.",
    domain: "sample",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    routingSummary: "Look up a sample record by query.",
    nearMisses: ["sample_store"],
  },
  execute(args) {
    return { success: true, data: { args }, latencyMs: 1 };
  },
};

export const sampleStore: ToolImplementation = {
  definition: {
    name: "sample_store",
    description: "Store a sample record.",
    domain: "sample",
    parameters: {
      type: "object",
      properties: { record: { type: "string" } },
      required: ["record"],
    },
    routingSummary: "Store a sample record.",
    nearMisses: ["sample_lookup"],
  },
  execute(args) {
    return { success: true, data: { args }, latencyMs: 1 };
  },
};
