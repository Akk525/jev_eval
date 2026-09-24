import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

const FAILURE_CODES = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"] as const;
export type FailureCodeKey = (typeof FAILURE_CODES)[number];
export type FailureTaxonomyKey = FailureCodeKey | "none";

export type FailureCounts = Record<FailureTaxonomyKey, number>;
export type FailureRates = Record<FailureTaxonomyKey, number>;

export interface FailurePoint {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  router_only: boolean;
  attempts: number;
  counts: FailureCounts;
  /** Fraction of attempts. */
  rates: FailureRates;
  /** R0 / attempts — infrastructure, kept separate from scientific failures (D6). */
  infrastructure_failure_rate: number;
  /** (R1+…+R6) / attempts — not folded into R0. */
  scientific_failure_rate: number;
  /** none / attempts */
  success_or_unclassified_rate: number;
}

export interface FailureSeries {
  architecture: string;
  router_only: boolean;
  points: FailurePoint[];
}

export interface Figure6Data {
  version: 1;
  figure: "figure6";
  metric: "failure_decomposition";
  y_axis_label: "Share of attempts";
  x_axis_label: "Number of Available Tools";
  note: string;
  /** Codes with at least one observation anywhere (R5/R6 omitted from plot when unused). */
  active_codes: FailureTaxonomyKey[];
  points: FailurePoint[];
  series: FailureSeries[];
}

export class Figure6Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure6Error";
  }
}

const ARCH_ORDER = ["baseline", "jev", "llm"] as const;

const FIGURE6_NOTE =
  "Failure mix vs toolspace size by architecture. R0 (infrastructure) is reported and plotted separately from R1–R6 scientific/model failures (D6). Rates are shares of all attempts in the cell. R5/R6 appear only when the harness emitted them. Router-only and full-agent cells are not mixed.";

/**
 * Build Figure 6 failure decomposition from a normalized analysis dataset alone.
 */
export function buildFigure6(dataset: AnalysisDataset): Figure6Data {
  const cells = groupCells(dataset.attempts);
  const points: FailurePoint[] = [];
  for (const bucket of cells.values()) {
    assertCompatibleCell(bucket);
    points.push(failurePointFromAttempts(bucket));
  }
  points.sort((left, right) => {
    const arch = archRank(left.architecture) - archRank(right.architecture);
    if (arch !== 0) return arch;
    if (left.router_only !== right.router_only) return left.router_only ? 1 : -1;
    return left.toolspace_size - right.toolspace_size;
  });

  const active = activeCodes(points);
  return {
    version: 1,
    figure: "figure6",
    metric: "failure_decomposition",
    y_axis_label: "Share of attempts",
    x_axis_label: "Number of Available Tools",
    note: FIGURE6_NOTE,
    active_codes: active,
    points,
    series: seriesFromPoints(points),
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure6Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure6ToJson(data: Figure6Data): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure6ToCsv(data: Figure6Data): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "router_only",
    "attempts",
    "count_R0",
    "count_R1",
    "count_R2",
    "count_R3",
    "count_R4",
    "count_R5",
    "count_R6",
    "count_none",
    "rate_R0",
    "rate_R1",
    "rate_R2",
    "rate_R3",
    "rate_R4",
    "rate_R5",
    "rate_R6",
    "rate_none",
    "infrastructure_failure_rate",
    "scientific_failure_rate",
  ];
  const lines = [headers.join(",")];
  for (const point of data.points) {
    lines.push(
      [
        point.architecture,
        point.toolspace_size,
        point.top_k === null ? "" : point.top_k,
        point.router_only,
        point.attempts,
        point.counts.R0,
        point.counts.R1,
        point.counts.R2,
        point.counts.R3,
        point.counts.R4,
        point.counts.R5,
        point.counts.R6,
        point.counts.none,
        point.rates.R0,
        point.rates.R1,
        point.rates.R2,
        point.rates.R3,
        point.rates.R4,
        point.rates.R5,
        point.rates.R6,
        point.rates.none,
        point.infrastructure_failure_rate,
        point.scientific_failure_rate,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Stacked scientific failures (R1–R6 + none) with R0 drawn as a separate outline series.
 */
export function figure6ToSvg(data: Figure6Data): string {
  const width = 820;
  const height = 460;
  const margin = { top: 40, right: 200, bottom: 56, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const xs = data.points.map((point) => point.toolspace_size);
  const xMin = xs.length === 0 ? 0 : Math.min(...xs);
  const xMax = xs.length === 0 ? 1 : Math.max(...xs);
  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.08;
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;
  const xScale = (n: number) => margin.left + ((n - xLo) / (xHi - xLo || 1)) * plotW;
  const yScale = (rate: number) => margin.top + (1 - rate) * plotH;

  const scientificStack = (["R1", "R2", "R3", "R4", "R5", "R6", "none"] as const).filter((code) =>
    data.active_codes.includes(code),
  );
  const stackColors: Record<string, string> = {
    R1: "#e45756",
    R2: "#f58518",
    R3: "#bac71a",
    R4: "#54a24b",
    R5: "#72b7b2",
    R6: "#b279a2",
    none: "#d9d9d9",
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">Figure 6 — Failure decomposition vs N (R0 separate)</text>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );

  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const y = yScale(tick);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#eee" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${tick.toFixed(2)}</text>`,
    );
  }

  for (const tick of uniqueSorted(xs)) {
    parts.push(
      `<text x="${xScale(tick)}" y="${margin.top + plotH + 20}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${tick}</text>`,
    );
  }

  parts.push(
    `<text x="${margin.left + plotW / 2}" y="${height - 16}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(data.x_axis_label)}</text>`,
  );
  parts.push(
    `<text x="18" y="${margin.top + plotH / 2}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" transform="rotate(-90 18 ${margin.top + plotH / 2})">${escapeXml(data.y_axis_label)}</text>`,
  );

  // Group bars: for each distinct N, place one bar per architecture (full-agent preferred first).
  const fullPoints = data.points.filter((point) => !point.router_only);
  const nValues = uniqueSorted(fullPoints.map((point) => point.toolspace_size));
  const archs = ARCH_ORDER.filter((architecture) =>
    fullPoints.some((point) => point.architecture === architecture),
  );
  const groupWidth = nValues.length <= 1 ? plotW * 0.2 : (plotW / Math.max(nValues.length, 1)) * 0.7;
  const barWidth = groupWidth / Math.max(archs.length, 1);

  for (const n of nValues) {
    const groupX = xScale(n) - groupWidth / 2;
    archs.forEach((architecture, archIndex) => {
      const point = fullPoints.find(
        (item) => item.architecture === architecture && item.toolspace_size === n,
      );
      if (point === undefined) return;
      const barX = groupX + archIndex * barWidth;
      let stacked = 0;
      for (const code of scientificStack) {
        const rate = point.rates[code];
        if (rate <= 0) continue;
        const yTop = yScale(stacked + rate);
        const yBot = yScale(stacked);
        parts.push(
          `<rect x="${barX + 1}" y="${yTop}" width="${Math.max(barWidth - 2, 1)}" height="${Math.max(yBot - yTop, 0)}" fill="${stackColors[code] ?? "#999"}" stroke="#fff" stroke-width="0.5"/>`,
        );
        stacked += rate;
      }
      // R0 as separate outline on top of the bar's infrastructure rate (from baseline y=0 upward as hashed overlay).
      if (point.rates.R0 > 0) {
        const yTop = yScale(point.rates.R0);
        const yBot = yScale(0);
        parts.push(
          `<rect x="${barX + 1}" y="${yTop}" width="${Math.max(barWidth - 2, 1)}" height="${Math.max(yBot - yTop, 0)}" fill="none" stroke="#1f4e79" stroke-width="2" stroke-dasharray="3 2"/>`,
        );
      }
    });
  }

  // R0 rate as explicit line series per architecture (visually separate from stacks).
  archs.forEach((architecture, archIndex) => {
    const archPoints = fullPoints
      .filter((point) => point.architecture === architecture)
      .sort((left, right) => left.toolspace_size - right.toolspace_size);
    if (archPoints.length === 0) return;
    const color = archStroke(architecture);
    const path = archPoints
      .map((point, index) => {
        const x = xScale(point.toolspace_size);
        const y = yScale(point.infrastructure_failure_rate);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4"/>`,
    );
    for (const point of archPoints) {
      const x = xScale(point.toolspace_size);
      const y = yScale(point.infrastructure_failure_rate);
      parts.push(
        `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>`,
      );
    }
    void archIndex;
  });

  // legend
  let legendY = margin.top + 8;
  const legendX = margin.left + plotW + 12;
  parts.push(
    `<text x="${legendX}" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="600">R0 infrastructure</text>`,
  );
  legendY += 14;
  parts.push(
    `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="#1f4e79" stroke-width="2" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<text x="${legendX + 26}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">R0 rate (line)</text>`,
  );
  legendY += 22;
  parts.push(
    `<text x="${legendX}" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="600">Scientific stack</text>`,
  );
  legendY += 6;
  for (const code of scientificStack) {
    legendY += 16;
    parts.push(
      `<rect x="${legendX}" y="${legendY - 8}" width="14" height="10" fill="${stackColors[code] ?? "#999"}"/>`,
    );
    parts.push(
      `<text x="${legendX + 20}" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${code}</text>`,
    );
  }
  legendY += 20;
  parts.push(
    `<text x="${legendX}" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="600">Architectures</text>`,
  );
  for (const architecture of archs) {
    legendY += 16;
    parts.push(
      `<text x="${legendX}" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${architecture}</text>`,
    );
  }

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

export function writeFigure6(
  data: Figure6Data,
  outDir: string,
): { jsonPath: string; csvPath: string; svgPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "figure6-failures.json");
  const csvPath = join(root, "figure6-failures.csv");
  const svgPath = join(root, "figure6-failures.svg");
  writeFileSync(jsonPath, figure6ToJson(data));
  writeFileSync(csvPath, figure6ToCsv(data));
  writeFileSync(svgPath, figure6ToSvg(data));
  return { jsonPath, csvPath, svgPath };
}

function groupCells(attempts: readonly NormalizedAttempt[]): Map<string, NormalizedAttempt[]> {
  const groups = new Map<string, NormalizedAttempt[]>();
  for (const attempt of attempts) {
    if (!isPlotArchitecture(attempt.architecture)) continue;
    const key = `${attempt.architecture}::${attempt.toolspace_size}::${attempt.router_only}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [attempt]);
    else bucket.push(attempt);
  }
  return groups;
}

function failurePointFromAttempts(attempts: readonly NormalizedAttempt[]): FailurePoint {
  const first = attempts[0]!;
  const counts = emptyCounts();
  for (const attempt of attempts) {
    const code = attempt.failure_code;
    if (code === null) counts.none += 1;
    else if (isFailureCode(code)) counts[code] += 1;
    else counts.none += 1;
  }
  const attemptsN = attempts.length;
  const rates = emptyRates();
  for (const key of Object.keys(counts) as FailureTaxonomyKey[]) {
    rates[key] = attemptsN === 0 ? 0 : counts[key] / attemptsN;
  }
  const scientific =
    counts.R1 + counts.R2 + counts.R3 + counts.R4 + counts.R5 + counts.R6;
  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: first.top_k,
    router_only: first.router_only,
    attempts: attemptsN,
    counts,
    rates,
    infrastructure_failure_rate: rates.R0,
    scientific_failure_rate: attemptsN === 0 ? 0 : scientific / attemptsN,
    success_or_unclassified_rate: rates.none,
  };
}

function seriesFromPoints(points: readonly FailurePoint[]): FailureSeries[] {
  const groups = new Map<string, FailurePoint[]>();
  for (const point of points) {
    const key = `${point.architecture}::${point.router_only}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [point]);
    else bucket.push(point);
  }
  const series: FailureSeries[] = [];
  for (const architecture of ARCH_ORDER) {
    for (const routerOnly of [false, true]) {
      const bucket = groups.get(`${architecture}::${routerOnly}`);
      if (bucket === undefined) continue;
      bucket.sort((left, right) => left.toolspace_size - right.toolspace_size);
      series.push({ architecture, router_only: routerOnly, points: bucket });
    }
  }
  return series;
}

function activeCodes(points: readonly FailurePoint[]): FailureTaxonomyKey[] {
  const active: FailureTaxonomyKey[] = [];
  for (const code of [...FAILURE_CODES, "none"] as FailureTaxonomyKey[]) {
    if (points.some((point) => point.counts[code] > 0)) active.push(code);
  }
  return active;
}

function assertCompatibleCell(attempts: readonly NormalizedAttempt[]): void {
  const first = attempts[0]!;
  for (const attempt of attempts.slice(1)) {
    if (attempt.architecture !== first.architecture) {
      throw new Figure6Error("architecture mismatch within figure6 cell");
    }
    if (attempt.toolspace_size !== first.toolspace_size) {
      throw new Figure6Error("toolspace_size mismatch within figure6 cell");
    }
    if (attempt.top_k !== first.top_k) {
      throw new Figure6Error(
        `top_k mismatch for ${first.architecture} n=${first.toolspace_size}: ${first.top_k} vs ${attempt.top_k}`,
      );
    }
    if (attempt.router_only !== first.router_only) {
      throw new Figure6Error("router_only mismatch within figure6 cell");
    }
  }
}

function emptyCounts(): FailureCounts {
  return { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, none: 0 };
}

function emptyRates(): FailureRates {
  return { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, none: 0 };
}

function isFailureCode(code: string): code is FailureCodeKey {
  return (FAILURE_CODES as readonly string[]).includes(code);
}

function isPlotArchitecture(architecture: string): boolean {
  return architecture === "baseline" || architecture === "jev" || architecture === "llm";
}

function archRank(architecture: string): number {
  const index = (ARCH_ORDER as readonly string[]).indexOf(architecture);
  return index === -1 ? 99 : index;
}

function archStroke(architecture: string): string {
  if (architecture === "baseline") return "#1f4e79";
  if (architecture === "jev") return "#c45c26";
  return "#2a7f62";
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
