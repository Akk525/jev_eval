export type Architecture = "baseline" | "jev" | "llm" | "mock";

export type TracingMode = "noop" | "memora";

export interface ModelRef {
  provider: string;
  model: string;
}

export interface AgentModelRef extends ModelRef {
  temperature: number;
}

/** Shape only. Issue #4 rejects invalid combinations before a run. */
export interface ExperimentConfig {
  architecture: Architecture;
  toolspaceSize: number;
  /** Null for baseline. Required for routed architectures; enforced by the loader. */
  topK: number | null;
  datasetPath: string;
  repetitions: number;
  /**
   * Max in-flight provider attempts (router + agent) for one experiment.
   * Default configs use 1. Allowed range is 1..MAX_PROVIDER_CONCURRENCY (8).
   */
  concurrency: number;
  seed: number;
  agent: AgentModelRef;
  /** Null when the architecture does not call a routing model. */
  router: ModelRef | null;
  pricingVersion: string;
  tracing: TracingMode;
  /**
   * When true, stop after routing, score Recall@k, and leave execution metrics excluded.
   * Defaults to false for full agent runs.
   */
  routerOnly: boolean;
}
