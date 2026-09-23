import type { JsonSchema } from "../../types/json-schema.js";
import type { ToolDefinition, ToolExecutionResult } from "../../types/tool.js";
import type { ToolFixture, ToolImplementation } from "../registry/registry.js";

export function defineTool(
  definition: ToolDefinition,
  run: (args: Readonly<Record<string, unknown>>, fixture: ToolFixture) => ToolExecutionResult,
): ToolImplementation {
  return {
    definition,
    execute(args, fixture) {
      if (args === null || typeof args !== "object" || Array.isArray(args)) {
        return { success: false, error: "arguments must be an object", latencyMs: 0 };
      }
      return run(args as Readonly<Record<string, unknown>>, fixture);
    },
  };
}

export function ok(data: unknown): ToolExecutionResult {
  return { success: true, data, latencyMs: 0 };
}

export function fail(error: string): ToolExecutionResult {
  return { success: false, error, latencyMs: 0 };
}

export function objectSchema(properties: Record<string, JsonSchema>, required: readonly string[]): JsonSchema {
  return { type: "object", properties, required: [...required] };
}

export function stringParam(description: string): JsonSchema {
  return { type: "string", description };
}

export function rows(fixture: ToolFixture, key: string): Record<string, unknown>[] {
  const value = fixture[key];
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => row !== null && typeof row === "object");
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
