import { canonicalJson, sha256 } from "../../canonical.js";
import type { ToolDefinition, ToolExecutionResult } from "../../types/tool.js";

export interface ToolFixture {
  readonly [key: string]: unknown;
}

export interface ToolImplementation {
  definition: ToolDefinition;
  execute(args: unknown, fixture: ToolFixture): ToolExecutionResult;
}

export interface ToolRegistry {
  readonly tail: readonly string[];
  register(tool: ToolImplementation): void;
  list(): readonly ToolDefinition[];
  hash(): string;
  execute(name: string, args: unknown, fixture: ToolFixture): ToolExecutionResult;
}

export function createToolRegistry(tail: readonly string[] = []): ToolRegistry {
  const frozenTail = [...tail];
  const tools = new Map<string, ToolImplementation>();
  const order: string[] = [];

  return {
    tail: frozenTail,
    register(tool) {
      const name = tool.definition.name;
      if (tools.has(name)) throw new Error(`duplicate tool: ${name}`);
      tools.set(name, tool);
      order.push(name);
    },
    list() {
      return order.map((name) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`missing tool: ${name}`);
        return tool.definition;
      });
    },
    hash() {
      const definitions = [...tools.values()]
        .map((tool) => tool.definition)
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      return sha256(canonicalJson({ tail: frozenTail, tools: definitions }));
    },
    execute(name, args, fixture) {
      const tool = tools.get(name);
      if (!tool) return { success: false, error: `unknown tool: ${name}`, latencyMs: 0 };
      return tool.execute(args, fixture);
    },
  };
}
