import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { summarizeLatency, type LatencySummary } from "../metrics/metrics.js";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

export interface LatencyComponentStats extends LatencySummary {
  /** Attempts contributing a non-null sample for this component. */
  n: number;
}

export interface LatencyPoint {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  attempts: number;
  router: LatencyComponentStats;
  agent: LatencyComponentStats;
  /**
   * Per-attempt sum of available router + agent wall times (null components → 0).
   * Attempts with both null are excluded from the denominator.
   */
  total: LatencyComponentStats;
  /**
   * Tool-executor wall time is not recorded on attempts yet.
   * Kept explicit so figure generators do not invent a series.
   */
  tool_latency: "unavailable";
}

export interface LatencySeries {
  architecture: string;
  points: LatencyPoint[];
}

export interface Figure3Data {
  version: 1;
  figure: "figure3";
  metric: "latency_ms";
  y_axis_label: "Latency (ms)";
  x_axis_label: "Number of Available Tools";
  note: string;
  series: LatencySeries[];
}

export class Figure3Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure3Error";
  }
}

const ARCH_ORDER = ["baseline", "jev", "llm"] as const;

const FIGURE3_NOTE =
  "Y-axis is wall-clock latency in ms from stored attempt fields. Points plot total p50; whiskers mark p95. Mean is in the data tables. Router and agent components are summarized separately. Tool-executor latency is unavailable (not stored). Router-only epochs are omitted.";

/**
 * Build Figure 3 latency series from a normalized analysis dataset alone.
 */
export function buildFigure3(dataset: AnalysisDataset): Figure3Data {
  const cells = groupFullAgentCells(dataset.attempts);
  const byArch = new Map<string, LatencyPoint[]>();
  for (const bucket of cells.values()) {
    assertCompatibleCell(bucket);
    const point = latencyPointFromAttempts(bucket);
    const list = byArch.get(point.architecture);
    if (list === undefined) byArch.set(point.architecture, [point]);
    else list.push(point);
  }

  const series: LatencySeries[] = [];
  for (const architecture of ARCH_ORDER) {
    const points = byArch.get(architecture);
    if (points === undefined) continue;
    points.sort((left, right) => left.toolspace_size - right.toolspace_size);
    series.push({ architecture, points });
  }

  return {
    version: 1,
    figure: "figure3",
    metric: "latency_ms",
    y_axis_label: "Latency (ms)",
    x_axis_label: "Number of Available Tools",
    note: FIGURE3_NOTE,
    series,
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure3Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure3ToJson(data: Figure3Data): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure3ToCsv(data: Figure3Data): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "attempts",
    "router_n",
    "router_mean",
    "router_p50",
    "router_p95",
    "agent_n",
    "agent_mean",
    "agent_p50",
    "agent_p95",
    "total_n",
    "total_mean",
    "total_p50",
    "total_p95",
    "tool_latency",
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
          point.router.n,
          csvNumber(point.router.mean),
          csvNumber(point.router.p50),
          csvNumber(point.router.p95),
          point.agent.n,
          csvNumber(point.agent.mean),
          csvNumber(point.agent.p50),
          csvNumber(point.agent.p95),
          point.total.n,
          csvNumber(point.total.mean),
          csvNumber(point.total.p50),
          csvNumber(point.total.p95),
          point.tool_latency,
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Total p50 lines with p95 whiskers; not mean-only. */
export function figure3ToSvg(data: Figure3Data): string {
  const width = 760;
  const height = 440;
  const margin = { top: 40, right: 160, bottom: 56, left: 72 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allTotals = data.series.flatMap((series) =>
    series.points.flatMap((point) => {
      const values: number[] = [];
      if (point.total.p50 !== null) values.push(point.total.p50);
      if (point.total.p95 !== null) values.push(point.total.p95);
      return values;
    }),
  );
  const xs = data.series.flatMap((series) => series.points.map((point) => point.toolspace_size));
  const xMin = xs.length === 0 ? 0 : Math.min(...xs);
  const xMax = xs.length === 0 ? 1 : Math.max(...xs);
  const yMax = allTotals.length === 0 ? 1 : Math.max(...allTotals, 0);
  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.05;
  const yPad = yMax === 0 ? 1 : yMax * 0.08;
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;
  const yHi = yMax + yPad;

  const xScale = (n: number) => margin.left + ((n - xLo) / (xHi - xLo || 1)) * plotW;
  const yScale = (value: number) => margin.top + (1 - value / (yHi || 1)) * plotH;

  const colors: Record<string, string> = {
    baseline: "#1f4e79",
    jev: "#c45c26",
    llm: "#2a7f62",
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">Figure 3 — ${escapeXml(data.y_axis_label)} vs ${escapeXml(data.x_axis_label)} (p50, whiskers p95)</text>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );

  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const value = yHi * fraction;
    const y = yScale(value);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e8e8e8" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${Math.round(value)}</text>`,
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
    const color = colors[series.architecture] ?? palette(seriesIndex);
    const plotted = series.points.filter((point) => point.total.p50 !== null);
    if (plotted.length === 0) return;

    const path = plotted
      .map((point, index) => {
        const x = xScale(point.toolspace_size);
        const y = yScale(point.total.p50!);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`);

    for (const point of plotted) {
      const x = xScale(point.toolspace_size);
      const y = yScale(point.total.p50!);
      if (point.total.p95 !== null) {
        const y95 = yScale(point.total.p95);
        parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y95}" stroke="${color}" stroke-width="1.5"/>`);
        parts.push(
          `<line x1="${x - 4}" y1="${y95}" x2="${x + 4}" y2="${y95}" stroke="${color}" stroke-width="1.5"/>`,
        );
      }
      parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`);
      if (point.total.mean !== null) {
        const yMean = yScale(point.total.mean);
        parts.push(
          `<circle cx="${x}" cy="${yMean}" r="2.5" fill="#fff" stroke="${color}" stroke-width="1.5"/>`,
        );
      }
    }

    const legendY = margin.top + 16 + seriesIndex * 28;
    const legendX = margin.left + plotW + 12;
    parts.push(
      `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="${color}" stroke-width="2"/>`,
    );
    parts.push(`<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="${color}"/>`);
    parts.push(
      `<text x="${legendX + 26}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" fill="#222">${escapeXml(series.architecture)} p50</text>`,
    );
    parts.push(
      `<circle cx="${legendX + 9}" cy="${legendY + 14}" r="2.5" fill="#fff" stroke="${color}" stroke-width="1.5"/>`,
    );
    parts.push(
      `<text x="${legendX + 26}" y="${legendY + 18}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#555">mean · whisker p95</text>`,
    );
  });

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

export function writeFigure3(
  data: Figure3Data,
  outDir: string,
): { jsonPath: string; csvPath: string; svgPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "figure3-latency.json");
  const csvPath = join(root, "figure3-latency.csv");
  const svgPath = join(root, "figure3-latency.svg");
  writeFileSync(jsonPath, figure3ToJson(data));
  writeFileSync(csvPath, figure3ToCsv(data));
  writeFileSync(svgPath, figure3ToSvg(data));
  return { jsonPath, csvPath, svgPath };
}

function latencyPointFromAttempts(attempts: readonly NormalizedAttempt[]): LatencyPoint {
  const first = attempts[0]!;
  const routerValues = attempts
    .map((attempt) => attempt.router_latency_ms)
    .filter((value): value is number => value !== null);
  const agentValues = attempts
    .map((attempt) => attempt.agent_latency_ms)
    .filter((value): value is number => value !== null);
  const totalValues: number[] = [];
  for (const attempt of attempts) {
    if (attempt.router_latency_ms === null && attempt.agent_latency_ms === null) continue;
    totalValues.push((attempt.router_latency_ms ?? 0) + (attempt.agent_latency_ms ?? 0));
  }

  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: first.top_k,
    attempts: attempts.length,
    router: withN(summarizeLatency(routerValues), routerValues.length),
    agent: withN(summarizeLatency(agentValues), agentValues.length),
    total: withN(summarizeLatency(totalValues), totalValues.length),
    tool_latency: "unavailable",
  };
}

function withN(summary: LatencySummary, n: number): LatencyComponentStats {
  return { ...summary, n };
}

function groupFullAgentCells(
  attempts: readonly NormalizedAttempt[],
): Map<string, NormalizedAttempt[]> {
  const groups = new Map<string, NormalizedAttempt[]>();
  for (const attempt of attempts) {
    if (attempt.router_only) continue;
    if (!isPlotArchitecture(attempt.architecture)) continue;
    const key = `${attempt.architecture}::${attempt.toolspace_size}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [attempt]);
    else bucket.push(attempt);
  }
  return groups;
}

function assertCompatibleCell(attempts: readonly NormalizedAttempt[]): void {
  const first = attempts[0]!;
  for (const attempt of attempts.slice(1)) {
    if (attempt.architecture !== first.architecture) {
      throw new Figure3Error("architecture mismatch within figure3 cell");
    }
    if (attempt.toolspace_size !== first.toolspace_size) {
      throw new Figure3Error("toolspace_size mismatch within figure3 cell");
    }
    if (attempt.top_k !== first.top_k) {
      throw new Figure3Error(
        `top_k mismatch for ${first.architecture} n=${first.toolspace_size}: ${first.top_k} vs ${attempt.top_k}`,
      );
    }
  }
}

function isPlotArchitecture(architecture: string): boolean {
  return architecture === "baseline" || architecture === "jev" || architecture === "llm";
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
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
