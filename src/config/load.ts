import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { canonicalJson, sha256 } from "../canonical.js";
import type { ExperimentConfig } from "../types/config.js";
import { ConfigError, parseExperimentConfig } from "./schema.js";

export interface LoadedConfig {
  config: ExperimentConfig;
  hash: string;
}

export function configHash(config: ExperimentConfig): string {
  return sha256(canonicalJson(config));
}

export function loadExperimentConfig(filePath: string): LoadedConfig {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`(root): failed to read config file ${filePath}: ${message}`);
  }

  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`(root): invalid YAML: ${message}`);
  }

  const config = parseExperimentConfig(raw);
  return { config, hash: configHash(config) };
}
