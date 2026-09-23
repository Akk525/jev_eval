import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ModelPrice } from "../metrics/metrics.js";

const modelPriceSchema = z
  .object({
    inputUsdPerMillion: z.number().nonnegative(),
    outputUsdPerMillion: z.number().nonnegative(),
  })
  .strict();

const pricingTableSchema = z
  .object({
    version: z.string().min(1),
    sourcedAt: z.string().min(1),
    sources: z.record(z.string().min(1)),
    models: z.record(modelPriceSchema),
  })
  .strict();

export interface PricingTable {
  version: string;
  sourcedAt: string;
  sources: Readonly<Record<string, string>>;
  models: Readonly<Record<string, ModelPrice>>;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export function loadPricingTable(filePath: string): PricingTable {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PricingError(`failed to read pricing file ${filePath}: ${message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PricingError(`invalid pricing JSON: ${message}`);
  }

  const parsed = pricingTableSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "(root)";
    throw new PricingError(`${field}: ${issue?.message ?? "invalid pricing table"}`);
  }
  return parsed.data;
}

export function modelPriceKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function requireModelPrice(table: PricingTable, provider: string, model: string): ModelPrice {
  const key = modelPriceKey(provider, model);
  const price = table.models[key];
  if (price === undefined) throw new PricingError(`pricing table ${table.version} has no entry for ${key}`);
  return price;
}
