import { createToolRegistry, type ToolRegistry } from "./registry/registry.js";

export const SMOKE_TOOLS = ["smoke_alpha", "smoke_beta", "smoke_gamma", "smoke_delta", "smoke_epsilon"] as const;

export function createSmokeRegistry(): ToolRegistry {
  const registry = createToolRegistry(SMOKE_TOOLS);
  for (const name of SMOKE_TOOLS) {
    const nearMisses = SMOKE_TOOLS.filter((other) => other !== name).slice(0, 2);
    registry.register({
      definition: {
        name,
        description: `Deterministic smoke tool ${name}.`,
        domain: "smoke",
        parameters: {
          type: "object",
          properties: { label: { type: "string" } },
          required: ["label"],
        },
        routingSummary: `Use ${name}.`,
        nearMisses,
      },
      execute(args) {
        return { success: true, data: { args }, latencyMs: 0 };
      },
    });
  }
  return registry;
}
