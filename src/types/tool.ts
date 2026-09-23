import type { JsonSchema } from "./json-schema.js";

export interface ToolDefinition {
  name: string;
  description: string;
  domain: string;
  parameters: JsonSchema;
  /** Frozen text the routers rank. Not a substitute for `parameters`. */
  routingSummary: string;
  /** Same-domain confusions first, then cross-domain. Frozen with the registry. */
  nearMisses: readonly string[];
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}
