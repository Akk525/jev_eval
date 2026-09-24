#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { selectAdaptiveThresholds, type ThresholdAttempt } from "../analysis/adaptive-threshold-select.js";
import { checkCalibrationBearingDirs } from "../analysis/calibration-check.js";
import { parseDataset } from "../dataset/schema.js";

const { values } = parseArgs({
  options: {
    results: { type: "string" },
    dataset: { type: "string" },
    "git-sha": { type: "string" },
    "write-policy": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: npm run select:adaptive-thresholds -- --results <dir> [--dataset <tasks.jsonl>] [--write-policy <path>] [--git-sha <sha>]

Run the pre-registered #42 threshold grid on the development taskId-hash split.
Escalation without paired LLM scores is modeled as full toolspace coverage.
`);
  process.exit(0);
}

const resultsDir = resolve(values.results ?? "");
if (!values.results) {
  console.error("missing --results <result-directory>");
  process.exit(2);
}

const config = JSON.parse(readFileSync(resolve(resultsDir, "config.json"), "utf8")) as {
  architecture?: string;
  datasetPath?: string;
  topK?: number;
  toolspaceSize?: number;
};
if (config.architecture !== "jev") {
  console.error("result directory architecture must be jev");
  process.exit(2);
}

const datasetPath = resolve(values.dataset ?? config.datasetPath ?? "datasets/v0.1/tasks.jsonl");
const tasks = parseDataset(readFileSync(datasetPath, "utf8"));
const requiredById = new Map(tasks.map((task) => [task.id, task.required_tools]));

const attempts: ThresholdAttempt[] = [];
for (const line of readFileSync(resolve(resultsDir, "runs.jsonl"), "utf8").split("\n")) {
  if (line.trim() === "") continue;
  const row = JSON.parse(line) as {
    taskId: string;
    confidence?: number | null;
    scores?: Record<string, number>;
    routingExcluded?: boolean;
    recallAtK?: number | null;
    top1Probability?: number | null;
  };
  if (row.routingExcluded) continue;
  if (row.confidence === null || row.confidence === undefined) continue;
  if (row.recallAtK === null || row.recallAtK === undefined) continue;
  if (!row.scores) continue;
  const requiredTools = requiredById.get(row.taskId);
  if (!requiredTools) {
    console.error(`task ${row.taskId} missing from dataset ${datasetPath}`);
    process.exit(2);
  }
  attempts.push({
    taskId: row.taskId,
    confidence: row.confidence,
    scores: row.scores,
    requiredTools,
    top1Probability: row.top1Probability ?? null,
  });
}

const parentRoot = resolve(resultsDir, "..");
const calibration = checkCalibrationBearingDirs(parentRoot);
const cited = calibration.usable.find((dir) => resolve(dir.directory) === resultsDir);
if (!cited) {
  console.error("results dir is not listed as usable by check:calibration on its parent root");
  console.error(JSON.stringify(calibration, null, 2));
  process.exit(2);
}

const selection = selectAdaptiveThresholds(attempts, {
  highK: 1,
  mediumK: config.topK ?? 5,
});

const report = {
  resultsDir,
  datasetPath,
  config,
  calibration_usable: true,
  selection,
};

console.log(JSON.stringify(report, null, 2));

if (selection.status === "negative") {
  console.error(`negative: ${selection.reason}`);
  process.exit(1);
}

if (values["write-policy"]) {
  const gitSha = values["git-sha"] ?? "UNKNOWN";
  const configRecord = config as {
    architecture?: string;
    toolspaceSize?: number;
    topK?: number;
    datasetPath?: string;
    configHash?: string;
    gitSha?: string;
  };
  const relativeResults = values.results!;
  const relativeDataset = values.dataset ?? config.datasetPath ?? "datasets/v0.1/tasks.jsonl";
  const policy = {
    version: "adaptive-policy-v1",
    status: "thresholds_locked",
    confidence_field: "confidence",
    never_use_top1_probability_as_confidence: true,
    branches: [
      {
        id: "high",
        description: `confidence >= ${selection.thresholds.T_high}`,
        action: { type: "jev_topk", k: 1 },
      },
      {
        id: "medium",
        description: `T_low <= confidence < T_high`,
        action: { type: "jev_topk", k: config.topK ?? 5 },
      },
      {
        id: "low",
        description: `confidence < ${selection.thresholds.T_low}`,
        action: { type: "escalate", target: "llm_topk", k: config.topK ?? 5 },
      },
    ],
    thresholds: selection.thresholds,
    threshold_source: {
      development_results_dir: relativeResults,
      development_split: "even FNV-1a taskId hash",
      dataset_path: relativeDataset,
      git_sha: gitSha,
      results_git_sha: configRecord.gitSha ?? null,
      config_hash: configRecord.configHash ?? null,
      objective: selection.objective,
      predictive: selection.predictive,
      notes:
        "Offline objective is routing-hit rate from stored scores (required tools in branch top-k). Low-confidence escalate without paired LLM ranks is modeled as full toolspace coverage for selection only.",
    },
  };
  writeFileSync(resolve(values["write-policy"]), `${JSON.stringify(policy, null, 2)}\n`);
  console.error(`wrote ${values["write-policy"]}`);
}
