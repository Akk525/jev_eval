import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aggregateRuns, type AggregateSummary } from "../metrics/aggregate.js";
import type { ExperimentConfig } from "../types/config.js";
import type { FailureCode, InfrastructureReason } from "../types/trace.js";
import type { TokenUsage } from "../types/usage.js";

export interface RunRecord {
  taskId: string;
  repetition: number;
  /** Exact ordered toolspace presented for this attempt. */
  toolspace: readonly string[];
  /** Ordered candidate tool names after routing. Null when the router failed. */
  candidates: readonly string[] | null;
  /** Full router distribution, or null when the router has none or failed. */
  scores: Readonly<Record<string, number>> | null;
  top1Probability: number | null;
  confidence: number | null;
  /** Router tokens. Zero when the router did not run or reported none. */
  routerUsage: TokenUsage;
  /** Agent tokens. Zero when the agent did not run. */
  agentUsage: TokenUsage;
  /** Cost recomputed from token counts and the config's pricing version. */
  pricedCostUsd: number;
  /** Provider-reported USD when one was sent. Null otherwise. */
  providerReportedCostUsd: number | null;
  /** Router wall time in ms. Null when the router did not complete. */
  routerLatencyMs: number | null;
  /** Agent wall time in ms. Null when the agent did not run. */
  agentLatencyMs: number | null;
  /**
   * Monotonic wall-clock ms for the complete attempted runner path for this
   * (taskId, repetition): from attempt start through router (when used), agent
   * (when used), synchronous tool execute (when used), and evaluation — measured
   * immediately before append. Always non-null on written rows.
   *
   * For R0 / incomplete attempts this is time until the infrastructure failure
   * was classified (not a fabricated end-to-end duration). Tool-executor-only
   * latency is not stored separately and must not be reconstructed from this field.
   */
  totalLatencyMs: number;
  /** Primary Recall@k. Null when routingExcluded. */
  recallAtK: number | null;
  lenientRecallAtK: number | null;
  /** Null when outside the selection-accuracy denominator (including router-only). */
  selectionAccuracy: number | null;
  executionExcluded: boolean;
  routingExcluded: boolean;
  executionSuccess: boolean;
  failureCode: FailureCode | null;
  infrastructureReason: InfrastructureReason | null;
  /** Adaptive policy version when architecture is adaptive. Null otherwise. */
  adaptivePolicyVersion: string | null;
  /** Selected adaptive branch. Null when not adaptive or router failed. */
  adaptiveBranch: "high" | "medium" | "low" | null;
  /** Effective candidate k after the policy. Null when not adaptive or router failed. */
  adaptiveSelectedK: number | null;
  /** Escalation target when the low branch fired. Null otherwise. */
  adaptiveEscalationTarget: "llm_topk" | null;
  /** Jev-only tokens inside an adaptive turn. Null when not adaptive. */
  adaptiveJevUsage: TokenUsage | null;
  /** Escalate-router tokens inside an adaptive turn. Null when not adaptive. */
  adaptiveEscalateUsage: TokenUsage | null;
  adaptiveJevLatencyMs: number | null;
  adaptiveEscalateLatencyMs: number | null;
}

export type ResultSummary = AggregateSummary;

export interface OpenResultDirectory {
  directory: string;
  completedKey(taskId: string, repetition: number): boolean;
  append(record: RunRecord): void;
  readRuns(): RunRecord[];
}

export interface ResultDirectoryRequest {
  root: string;
  timestamp: string;
  config: ExperimentConfig;
  configHash: string;
  datasetVersion: string;
  registryHash: string;
  gitSha: string;
  resume?: boolean;
}

export class ResultStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResultStoreError";
  }
}

export function openResultDirectory(request: ResultDirectoryRequest): OpenResultDirectory {
  const k = request.config.topK === null ? "all" : String(request.config.topK);
  const directory = join(
    request.root,
    `${request.timestamp}_${request.config.architecture}_n${request.config.toolspaceSize}_k${k}_${request.gitSha}`,
  );
  const configPath = join(directory, "config.json");
  const stored = {
    ...request.config,
    configHash: request.configHash,
    datasetVersion: request.datasetVersion,
    registryHash: request.registryHash,
    gitSha: request.gitSha,
  };

  if (existsSync(directory)) {
    if (!request.resume) {
      throw new ResultStoreError(`refusing to overwrite result directory ${directory}`);
    }
    const existing = JSON.parse(readFileSync(configPath, "utf8")) as { configHash?: string };
    if (existing.configHash !== request.configHash) {
      throw new ResultStoreError("config hash mismatch; refusing to resume");
    }
  } else {
    mkdirSync(directory, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(stored, null, 2)}\n`);
    writeFileSync(join(directory, "runs.jsonl"), "");
    writeFileSync(join(directory, "failures.jsonl"), "");
    writeJsonAtomic(join(directory, "checkpoint.json"), { completed: [] });
    writeSummary(directory, []);
  }

  const completed = new Set(readRuns(directory).map(keyOf));

  return {
    directory,
    completedKey(taskId, repetition) {
      return completed.has(`${taskId}::${repetition}`);
    },
    append(record) {
      appendFileSync(join(directory, "runs.jsonl"), `${JSON.stringify(record)}\n`);
      completed.add(keyOf(record));
      const runs = readRuns(directory);
      writeSummary(directory, runs);
      writeFailures(directory, runs);
      writeJsonAtomic(join(directory, "checkpoint.json"), {
        completed: [...completed].sort(),
      });
    },
    readRuns() {
      return readRuns(directory);
    },
  };
}

function readRuns(directory: string): RunRecord[] {
  const text = readFileSync(join(directory, "runs.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunRecord);
}

function writeSummary(directory: string, runs: readonly RunRecord[]): void {
  writeFileSync(join(directory, "summary.json"), `${JSON.stringify(aggregateRuns(runs), null, 2)}\n`);
}

function writeFailures(directory: string, runs: readonly RunRecord[]): void {
  const lines = runs
    .filter((run) => run.failureCode !== null)
    .map((run) => JSON.stringify(run))
    .join("\n");
  writeFileSync(join(directory, "failures.jsonl"), lines.length === 0 ? "" : `${lines}\n`);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, filePath);
}

function keyOf(record: { taskId: string; repetition: number }): string {
  return `${record.taskId}::${record.repetition}`;
}
