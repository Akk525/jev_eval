import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { summarizeSamples, type SampleSummary } from "../metrics/metrics.js";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

export interface RecallPoint {
  architecture: string;
  toolspace_size: number;
  top_k: number;
  router_only: boolean;
  attempts: number;
  routing_scored: number;
  /** Primary / strict Recall@k (required_tools only). */
  recall_at_k: number | null;
  recall_at_k_stats: SampleSummary;
  /** Lenient recall — kept distinct; never folded into primary. */
  lenient_recall_at_k: number | null;
  lenient_recall_at_k_stats: SampleSummary;
  repetitions: number;
}

export interface RecallSeries {
  /** e.g. "jev-n25-strict", "llm-n25-lenient" */
  key: string;
  architecture: string;
  toolspace_size: number;
  router_only: boolean;
  metric: "strict" | "lenient";
  points: Array<{
    top_k: number;
    value: number;
    ci95_low: number | null;
    ci95_high: number | null;
  }>;
}

export interface Figure4Data {
  version: 1;
  figure: "figure4";
  metric: "recall_at_k";
  y_axis_label: "Recall@k";
  x_axis_label: "k (top-k)";
  note: string;
  points: RecallPoint[];
  series: RecallSeries[];
}

export class Figure4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure4Error";
  }
}

const ARCH_ORDER = ["jev", "llm"] as const;

const FIGURE4_NOTE =
  "Y-axis is routing Recall@k. Strict (solid) uses required_tools only; lenient (dashed) stays a separate series and is never folded into primary Recall@k. X-axis is top-k. Baseline is omitted (no router). k-ablation points appear when multiple k values exist for the same architecture × N. Router-only and full-agent cells are not mixed.";

/**
 * Build Figure 4 Recall@k series from a normalized analysis dataset alone.
 */
export function buildFigure4(dataset: AnalysisDataset): Figure4Data {
  const cells = groupRoutedCells(dataset.attempts);
  const points: RecallPoint[] = [];
  for (const bucket of cells.values()) {
    assertCompatibleCell(bucket);
    points.push(recallPointFromAttempts(bucket));
  }
  points.sort((left, right) => {
    const arch = archRank(left.architecture) - archRank(right.architecture);
    if (arch !== 0) return arch;
    if (left.toolspace_size !== right.toolspace_size) {
      return left.toolspace_size - right.toolspace_size;
    }
    if (left.router_only !== right.router_only) return left.router_only ? 1 : -1;
    return left.top_k - right.top_k;
  });

  return {
    version: 1,
    figure: "figure4",
    metric: "recall_at_k",
    y_axis_label: "Recall@k",
    x_axis_label: "k (top-k)",
    note: FIGURE4_NOTE,
    points,
    series: seriesFromPoints(points),
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure4Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure4ToJson(data: Figure4Data): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure4ToCsv(data: Figure4Data): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "router_only",
    "attempts",
    "routing_scored",
    "recall_at_k",
    "recall_at_k_mean",
    "recall_at_k_stddev",
    "recall_at_k_ci95_low",
    "recall_at_k_ci95_high",
    "lenient_recall_at_k",
    "lenient_recall_at_k_mean",
    "lenient_recall_at_k_stddev",
    "lenient_recall_at_k_ci95_low",
    "lenient_recall_at_k_ci95_high",
    "repetitions",
  ];
  const lines = [headers.join(",")];
  for (const point of data.points) {
    lines.push(
      [
        point.architecture,
        point.toolspace_size,
        point.top_k,
        point.router_only,
        point.attempts,
        point.routing_scored,
        csvNumber(point.recall_at_k),
        csvNumber(point.recall_at_k_stats.mean),
        csvNumber(point.recall_at_k_stats.stddev),
        csvNumber(point.recall_at_k_stats.ci95Low),
        csvNumber(point.recall_at_k_stats.ci95High),
        csvNumber(point.lenient_recall_at_k),
        csvNumber(point.lenient_recall_at_k_stats.mean),
        csvNumber(point.lenient_recall_at_k_stats.stddev),
        csvNumber(point.lenient_recall_at_k_stats.ci95Low),
        csvNumber(point.lenient_recall_at_k_stats.ci95High),
        point.repetitions,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function figure4ToSvg(data: Figure4Data): string {
  const width = 760;
  const height = 440;
  const margin = { top: 40, right: 180, bottom: 56, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allPoints = data.series.flatMap((series) => series.points);
  const xs = allPoints.map((point) => point.top_k);
  const xMin = xs.length === 0 ? 0 : Math.min(...xs);
  const xMax = xs.length === 0 ? 1 : Math.max(...xs);
  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.08;
  const xLo = Math.max(0, xMin - xPad);
  const xHi = xMax + xPad;

  const xScale = (k: number) => margin.left + ((k - xLo) / (xHi - xLo || 1)) * plotW;
  const yScale = (rate: number) => margin.top + (1 - rate) * plotH;

  const colors: Record<string, string> = {
    jev: "#c45c26",
    llm: "#2a7f62",
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">Figure 4 — ${escapeXml(data.y_axis_label)} vs ${escapeXml(data.x_axis_label)}</text>`,
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
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e8e8e8" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${tick.toFixed(2)}</text>`,
    );
  }

  for (const tick of uniqueSorted(xs)) {
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
    if (series.points.length === 0) return;
    const color = colors[series.architecture] ?? palette(seriesIndex);
    const dashed = series.metric === "lenient";
    const dash = dashed ? ' stroke-dasharray="6 4"' : "";
    const path = series.points
      .map((point, index) => {
        const x = xScale(point.top_k);
        const y = yScale(point.value);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"${dash}/>`);

    for (const point of series.points) {
      const x = xScale(point.top_k);
      const y = yScale(point.value);
      if (point.ci95_low !== null && point.ci95_high !== null) {
        const yLo = yScale(clamp01(point.ci95_low));
        const yHi = yScale(clamp01(point.ci95_high));
        parts.push(`<line x1="${x}" y1="${yHi}" x2="${x}" y2="${yLo}" stroke="${color}" stroke-width="1.5"/>`);
        parts.push(
          `<line x1="${x - 4}" y1="${yHi}" x2="${x + 4}" y2="${yHi}" stroke="${color}" stroke-width="1.5"/>`,
        );
        parts.push(
          `<line x1="${x - 4}" y1="${yLo}" x2="${x + 4}" y2="${yLo}" stroke="${color}" stroke-width="1.5"/>`,
        );
      }
      parts.push(
        dashed
          ? `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>`
          : `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`,
      );
    }

    const legendY = margin.top + 16 + seriesIndex * 18;
    const legendX = margin.left + plotW + 12;
    parts.push(
      `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="${color}" stroke-width="2"${dash}/>`,
    );
    parts.push(
      dashed
        ? `<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="#fff" stroke="${color}" stroke-width="2"/>`
        : `<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="${color}"/>`,
    );
    parts.push(
      `<text x="${legendX + 26}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#222">${escapeXml(series.key)}</text>`,
    );
  });

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

export function writeFigure4(
  data: Figure4Data,
  outDir: string,
): { jsonPath: string; csvPath: string; svgPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "figure4-recall.json");
  const csvPath = join(root, "figure4-recall.csv");
  const svgPath = join(root, "figure4-recall.svg");
  writeFileSync(jsonPath, figure4ToJson(data));
  writeFileSync(csvPath, figure4ToCsv(data));
  writeFileSync(svgPath, figure4ToSvg(data));
  return { jsonPath, csvPath, svgPath };
}

function groupRoutedCells(
  attempts: readonly NormalizedAttempt[],
): Map<string, NormalizedAttempt[]> {
  const groups = new Map<string, NormalizedAttempt[]>();
  for (const attempt of attempts) {
    if (!isRoutedArchitecture(attempt.architecture)) continue;
    if (attempt.top_k === null) {
      throw new Figure4Error(
        `routed architecture ${attempt.architecture} missing top_k in ${attempt.source_directory}`,
      );
    }
    const key = `${attempt.architecture}::${attempt.toolspace_size}::${attempt.top_k}::${attempt.router_only}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [attempt]);
    else bucket.push(attempt);
  }
  return groups;
}

function recallPointFromAttempts(attempts: readonly NormalizedAttempt[]): RecallPoint {
  const first = attempts[0]!;
  const topK = first.top_k;
  if (topK === null) {
    throw new Figure4Error(`missing top_k for ${first.architecture}`);
  }

  const strictValues = attempts
    .filter((attempt) => !attempt.routing_excluded && attempt.recall_at_k !== null)
    .map((attempt) => attempt.recall_at_k as number);
  const lenientValues = attempts
    .filter((attempt) => !attempt.routing_excluded && attempt.lenient_recall_at_k !== null)
    .map((attempt) => attempt.lenient_recall_at_k as number);

  const strictByRep = ratesByRepetition(attempts, "strict");
  const lenientByRep = ratesByRepetition(attempts, "lenient");

  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: topK,
    router_only: first.router_only,
    attempts: attempts.length,
    routing_scored: strictValues.length,
    recall_at_k: strictValues.length === 0 ? null : mean(strictValues),
    recall_at_k_stats:
      strictByRep.length >= 2 ? summarizeSamples(strictByRep) : summarizeSamples(strictValues),
    lenient_recall_at_k: lenientValues.length === 0 ? null : mean(lenientValues),
    lenient_recall_at_k_stats:
      lenientByRep.length >= 2 ? summarizeSamples(lenientByRep) : summarizeSamples(lenientValues),
    repetitions: new Set(attempts.map((attempt) => attempt.repetition)).size,
  };
}

function ratesByRepetition(
  attempts: readonly NormalizedAttempt[],
  metric: "strict" | "lenient",
): number[] {
  const byRep = new Map<number, number[]>();
  for (const attempt of attempts) {
    if (attempt.routing_excluded) continue;
    const value = metric === "strict" ? attempt.recall_at_k : attempt.lenient_recall_at_k;
    if (value === null) continue;
    const bucket = byRep.get(attempt.repetition);
    if (bucket === undefined) byRep.set(attempt.repetition, [value]);
    else bucket.push(value);
  }
  if (byRep.size < 2) return [];
  return [...byRep.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, values]) => mean(values));
}

function seriesFromPoints(points: readonly RecallPoint[]): RecallSeries[] {
  const groups = new Map<string, RecallPoint[]>();
  for (const point of points) {
    const key = `${point.architecture}::${point.toolspace_size}::${point.router_only}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [point]);
    else bucket.push(point);
  }

  const series: RecallSeries[] = [];
  const orderedKeys = [...groups.keys()].sort((left, right) => {
    const [leftArch, leftN, leftOnly] = left.split("::");
    const [rightArch, rightN, rightOnly] = right.split("::");
    const arch = archRank(leftArch!) - archRank(rightArch!);
    if (arch !== 0) return arch;
    if (Number(leftN) !== Number(rightN)) return Number(leftN) - Number(rightN);
    return leftOnly === rightOnly ? 0 : leftOnly === "true" ? 1 : -1;
  });

  for (const groupKey of orderedKeys) {
    const bucket = groups.get(groupKey)!;
    bucket.sort((left, right) => left.top_k - right.top_k);
    const first = bucket[0]!;
    const mode = first.router_only ? "router-only" : "full";
    for (const metric of ["strict", "lenient"] as const) {
      const seriesPoints = bucket
        .map((point) => {
          const value = metric === "strict" ? point.recall_at_k : point.lenient_recall_at_k;
          const stats =
            metric === "strict" ? point.recall_at_k_stats : point.lenient_recall_at_k_stats;
          if (value === null) return null;
          return {
            top_k: point.top_k,
            value,
            ci95_low: point.repetitions >= 2 ? stats.ci95Low : null,
            ci95_high: point.repetitions >= 2 ? stats.ci95High : null,
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);
      if (seriesPoints.length === 0) continue;
      series.push({
        key: `${first.architecture}-n${first.toolspace_size}-${mode}-${metric}`,
        architecture: first.architecture,
        toolspace_size: first.toolspace_size,
        router_only: first.router_only,
        metric,
        points: seriesPoints,
      });
    }
  }
  return series;
}

function assertCompatibleCell(attempts: readonly NormalizedAttempt[]): void {
  const first = attempts[0]!;
  for (const attempt of attempts.slice(1)) {
    if (attempt.architecture !== first.architecture) {
      throw new Figure4Error("architecture mismatch within figure4 cell");
    }
    if (attempt.toolspace_size !== first.toolspace_size) {
      throw new Figure4Error("toolspace_size mismatch within figure4 cell");
    }
    if (attempt.top_k !== first.top_k) {
      throw new Figure4Error("top_k mismatch within figure4 cell");
    }
    if (attempt.router_only !== first.router_only) {
      throw new Figure4Error(
        `router_only mismatch for ${first.architecture} n=${first.toolspace_size} k=${first.top_k}`,
      );
    }
  }
}

function isRoutedArchitecture(architecture: string): boolean {
  return architecture === "jev" || architecture === "llm";
}

function archRank(architecture: string): number {
  const index = (ARCH_ORDER as readonly string[]).indexOf(architecture);
  return index === -1 ? 99 : index;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
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
