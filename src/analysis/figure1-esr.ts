import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  aggregateByRepetition,
  type AggregateRun,
} from "../metrics/aggregate.js";
import { executionSuccessRate, type SampleSummary } from "../metrics/metrics.js";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

export interface Figure1Point {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  attempts: number;
  execution_scored: number;
  /** Overall ESR over execution-scored attempts (R0 / executionExcluded out). */
  execution_success_rate: number | null;
  /** Mean ESR across repetition indexes when ≥2 reps contribute; else null. */
  by_repetition_mean: number | null;
  by_repetition_stddev: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
  repetitions: number;
}

export interface Figure1Series {
  architecture: string;
  points: Figure1Point[];
}

export interface Figure1Data {
  version: 1;
  figure: "figure1";
  metric: "execution_success_rate";
  y_axis_label: "Execution Success Rate";
  x_axis_label: "Number of Available Tools";
  note: string;
  series: Figure1Series[];
}

export class Figure1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure1Error";
  }
}

const ARCH_ORDER = ["baseline", "jev", "llm"] as const;

const FIGURE1_NOTE =
  "Y-axis is Execution Success Rate until end-to-end Task Success exists. R0 and other executionExcluded attempts are out of the denominator (D6). Router-only epochs are omitted. Uncertainty bands use per-repetition ESR when ≥2 repetition indexes exist.";

/**
 * Build Figure 1 series from a normalized analysis dataset alone.
 * Does not read `runs.jsonl` or rewrite result directories.
 */
export function buildFigure1(dataset: AnalysisDataset): Figure1Data {
  const fullAgent = dataset.attempts.filter((attempt) => !attempt.router_only);
  const groups = new Map<string, NormalizedAttempt[]>();
  for (const attempt of fullAgent) {
    if (!isPlotArchitecture(attempt.architecture)) continue;
    const key = `${attempt.architecture}::${attempt.toolspace_size}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [attempt]);
    else bucket.push(attempt);
  }

  const byArch = new Map<string, Figure1Point[]>();
  for (const bucket of groups.values()) {
    assertCompatibleCell(bucket);
    const point = pointFromAttempts(bucket);
    const list = byArch.get(point.architecture);
    if (list === undefined) byArch.set(point.architecture, [point]);
    else list.push(point);
  }

  const series: Figure1Series[] = [];
  for (const architecture of ARCH_ORDER) {
    const points = byArch.get(architecture);
    if (points === undefined) continue;
    points.sort((left, right) => left.toolspace_size - right.toolspace_size);
    series.push({ architecture, points });
  }

  // Any unexpected architectures after the known three (should not happen).
  for (const [architecture, points] of [...byArch.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if ((ARCH_ORDER as readonly string[]).includes(architecture)) continue;
    points.sort((left, right) => left.toolspace_size - right.toolspace_size);
    series.push({ architecture, points });
  }

  return {
    version: 1,
    figure: "figure1",
    metric: "execution_success_rate",
    y_axis_label: "Execution Success Rate",
    x_axis_label: "Number of Available Tools",
    note: FIGURE1_NOTE,
    series,
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure1Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure1ToJson(data: Figure1Data): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure1ToCsv(data: Figure1Data): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "attempts",
    "execution_scored",
    "execution_success_rate",
    "by_repetition_mean",
    "by_repetition_stddev",
    "ci95_low",
    "ci95_high",
    "repetitions",
  ];
  const lines = [headers.join(",")];
  for (const series of data.series) {
    for (const point of series.points) {
      lines.push(
        [
          point.architecture,
          point.toolspace_size,
          point.top_k === null ? "" : point.top_k,
          point.attempts,
          point.execution_scored,
          csvNumber(point.execution_success_rate),
          csvNumber(point.by_repetition_mean),
          csvNumber(point.by_repetition_stddev),
          csvNumber(point.ci95_low),
          csvNumber(point.ci95_high),
          point.repetitions,
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Minimal multi-series SVG — no plotting dependency. */
export function figure1ToSvg(data: Figure1Data): string {
  const width = 720;
  const height = 420;
  const margin = { top: 40, right: 140, bottom: 56, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allPoints = data.series.flatMap((series) => series.points);
  const xs = allPoints.map((point) => point.toolspace_size);
  const xMin = xs.length === 0 ? 0 : Math.min(...xs);
  const xMax = xs.length === 0 ? 1 : Math.max(...xs);
  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.05;
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;

  const xScale = (n: number) => margin.left + ((n - xLo) / (xHi - xLo || 1)) * plotW;
  const yScale = (rate: number) => margin.top + (1 - rate) * plotH;

  const colors: Record<string, string> = {
    baseline: "#1f4e79",
    jev: "#c45c26",
    llm: "#2a7f62",
  };

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">Figure 1 — ${escapeXml(data.y_axis_label)} vs ${escapeXml(data.x_axis_label)}</text>`,
  );

  // axes
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );

  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const y = yScale(tick);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e8e8e8" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${tick.toFixed(2)}</text>`,
    );
  }

  const xTicks = uniqueSorted(xs);
  for (const tick of xTicks) {
    const x = xScale(tick);
    parts.push(
      `<text x="${x}" y="${margin.top + plotH + 20}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${tick}</text>`,
    );
  }

  parts.push(
    `<text x="${margin.left + plotW / 2}" y="${height - 16}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(data.x_axis_label)}</text>`,
  );
  parts.push(
    `<text x="18" y="${margin.top + plotH / 2}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" transform="rotate(-90 18 ${margin.top + plotH / 2})">${escapeXml(data.y_axis_label)}</text>`,
  );

  data.series.forEach((series, seriesIndex) => {
    const color = colors[series.architecture] ?? palette(seriesIndex);
    const plotted = series.points.filter(
      (point): point is Figure1Point & { execution_success_rate: number } =>
        point.execution_success_rate !== null,
    );
    if (plotted.length === 0) return;

    const path = plotted
      .map((point, index) => {
        const x = xScale(point.toolspace_size);
        const y = yScale(point.execution_success_rate);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`);

    for (const point of plotted) {
      const x = xScale(point.toolspace_size);
      const y = yScale(point.execution_success_rate);
      if (point.ci95_low !== null && point.ci95_high !== null) {
        const yLo = yScale(clamp01(point.ci95_low));
        const yHi = yScale(clamp01(point.ci95_high));
        parts.push(
          `<line x1="${x}" y1="${yHi}" x2="${x}" y2="${yLo}" stroke="${color}" stroke-width="1.5"/>`,
        );
        parts.push(
          `<line x1="${x - 4}" y1="${yHi}" x2="${x + 4}" y2="${yHi}" stroke="${color}" stroke-width="1.5"/>`,
        );
        parts.push(
          `<line x1="${x - 4}" y1="${yLo}" x2="${x + 4}" y2="${yLo}" stroke="${color}" stroke-width="1.5"/>`,
        );
      }
      parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`);
    }

    const legendY = margin.top + 16 + seriesIndex * 20;
    const legendX = margin.left + plotW + 16;
    parts.push(`<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="${color}" stroke-width="2"/>`);
    parts.push(`<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="${color}"/>`);
    parts.push(
      `<text x="${legendX + 26}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" fill="#222">${escapeXml(series.architecture)}</text>`,
    );
  });

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

export function writeFigure1(
  data: Figure1Data,
  outDir: string,
): { jsonPath: string; csvPath: string; svgPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "figure1-esr.json");
  const csvPath = join(root, "figure1-esr.csv");
  const svgPath = join(root, "figure1-esr.svg");
  writeFileSync(jsonPath, figure1ToJson(data));
  writeFileSync(csvPath, figure1ToCsv(data));
  writeFileSync(svgPath, figure1ToSvg(data));
  return { jsonPath, csvPath, svgPath };
}

function pointFromAttempts(attempts: readonly NormalizedAttempt[]): Figure1Point {
  const first = attempts[0]!;
  const aggregateRuns: AggregateRun[] = attempts.map((attempt) => ({
    repetition: attempt.repetition,
    routingExcluded: attempt.routing_excluded,
    executionExcluded: attempt.execution_excluded,
    executionSuccess: attempt.execution_success,
    failureCode: attempt.failure_code,
    recallAtK: attempt.recall_at_k,
    confidence: attempt.confidence,
    routerUsage: {
      inputTokens: attempt.router_input_tokens,
      outputTokens: attempt.router_output_tokens,
    },
    agentUsage: {
      inputTokens: attempt.agent_input_tokens,
      outputTokens: attempt.agent_output_tokens,
    },
    pricedCostUsd: attempt.priced_cost_usd,
    providerReportedCostUsd: attempt.provider_reported_cost_usd,
    routerLatencyMs: attempt.router_latency_ms,
    agentLatencyMs: attempt.agent_latency_ms,
  }));

  const executionScored = attempts.filter((attempt) => !attempt.execution_excluded).length;
  const esr = executionSuccessRate(
    attempts.map((attempt) => ({
      executionExcluded: attempt.execution_excluded,
      executionSuccess: attempt.execution_success,
    })),
  );
  const byRep = aggregateByRepetition(aggregateRuns);
  const repStats: SampleSummary | null = byRep?.execution_success_rate ?? null;

  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: first.top_k,
    attempts: attempts.length,
    execution_scored: executionScored,
    execution_success_rate: esr,
    by_repetition_mean: repStats?.mean ?? null,
    by_repetition_stddev: repStats?.stddev ?? null,
    ci95_low: repStats?.ci95Low ?? null,
    ci95_high: repStats?.ci95High ?? null,
    repetitions: byRep?.repetitions ?? distinctReps(attempts),
  };
}

function assertCompatibleCell(attempts: readonly NormalizedAttempt[]): void {
  const first = attempts[0]!;
  for (const attempt of attempts.slice(1)) {
    if (attempt.architecture !== first.architecture) {
      throw new Figure1Error("architecture mismatch within figure1 cell");
    }
    if (attempt.toolspace_size !== first.toolspace_size) {
      throw new Figure1Error("toolspace_size mismatch within figure1 cell");
    }
    if (attempt.top_k !== first.top_k) {
      throw new Figure1Error(
        `top_k mismatch for ${first.architecture} n=${first.toolspace_size}: ${first.top_k} vs ${attempt.top_k}`,
      );
    }
  }
}

function isPlotArchitecture(architecture: string): boolean {
  return architecture === "baseline" || architecture === "jev" || architecture === "llm";
}

function distinctReps(attempts: readonly NormalizedAttempt[]): number {
  return new Set(attempts.map((attempt) => attempt.repetition)).size;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function palette(index: number): string {
  const colors = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2"];
  return colors[index % colors.length]!;
}
