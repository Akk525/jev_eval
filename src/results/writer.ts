import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executionSuccessRate } from "../metrics/metrics.js";
import type { ExperimentConfig } from "../types/config.js";
import type { FailureCode, InfrastructureReason } from "../types/trace.js";

export interface RunRecord {
  taskId: string;
  repetition: number;
  /** Exact ordered toolspace presented for this attempt. */
  toolspace: readonly string[];
  /** Full router distribution, or null when the router has none or failed. */
  scores: Readonly<Record<string, number>> | null;
  top1Probability: number | null;
  confidence: number | null;
  executionExcluded: boolean;
  routingExcluded: boolean;
  executionSuccess: boolean;
  failureCode: FailureCode | null;
  infrastructureReason: InfrastructureReason | null;
}

export interface ResultSummary {
  attempts: number;
  r0_attempts: number;
  routing_scored: number;
  execution_scored: number;
  execution_success_rate: number | null;
}

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
  const summary: ResultSummary = {
    attempts: runs.length,
    r0_attempts: runs.filter((run) => run.failureCode === "R0").length,
    routing_scored: runs.filter((run) => !run.routingExcluded).length,
    execution_scored: runs.filter((run) => !run.executionExcluded).length,
    execution_success_rate: executionSuccessRate(
      runs.map((run) => ({
        executionExcluded: run.executionExcluded,
        executionSuccess: run.executionSuccess,
      })),
    ),
  };
  writeFileSync(join(directory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
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
