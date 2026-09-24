import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

export interface CostPoint {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  attempts: number;
  pricing_version: string;
  /** Sum of priced_cost_usd over attempts (from pinned pricing + token counts). */
  priced_cost_usd_total: number;
  /** Mean priced cost per attempt (cost/task). */
  priced_cost_usd_per_task: number;
  /**
   * Sum of provider-reported USD when any attempt reported one.
   * Labeled separately — never substituted for priced cost.
   */
  provider_reported_cost_usd_total: number | null;
  provider_reported_attempts: number;
}

export interface TokenPoint {
  architecture: string;
  toolspace_size: number;
  top_k: number | null;
  attempts: number;
  router_input_tokens: number;
  router_output_tokens: number;
  /** router_input + router_output */
  router_tokens: number;
  /** Mean router tokens per attempt. */
  router_tokens_per_task: number;
  agent_input_tokens: number;
  agent_output_tokens: number;
  agent_tokens: number;
  agent_tokens_per_task: number;
  total_tokens: number;
  total_tokens_per_task: number;
}

export interface CostSeries {
  architecture: string;
  points: CostPoint[];
}

export interface TokenSeries {
  /** e.g. "jev-router", "jev-agent", "baseline-agent" */
  key: string;
  architecture: string;
  component: "router" | "agent";
  points: Array<{ toolspace_size: number; tokens_per_task: number; tokens_total: number }>;
}

export interface Figure2CostData {
  version: 1;
  figure: "figure2-cost";
  metric: "priced_cost_usd_per_task";
  y_axis_label: "Priced Cost per Task (USD)";
  x_axis_label: "Number of Available Tools";
  pricing_version: string;
  note: string;
  series: CostSeries[];
}

export interface Figure2TokenData {
  version: 1;
  figure: "figure2-tokens";
  metric: "tokens_per_task";
  y_axis_label: "Tokens per Task";
  x_axis_label: "Number of Available Tools";
  note: string;
  /** Flat points with router/agent columns for tabular export. */
  points: TokenPoint[];
  /** Plot series: router and agent broken out when present. */
  series: TokenSeries[];
}

export class Figure2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure2Error";
  }
}

const ARCH_ORDER = ["baseline", "jev", "llm"] as const;

const COST_NOTE =
  "Y-axis is priced cost/task from token counts and the pinned pricing version on the analysis dataset. Provider-reported cost is stored separately and is never used as a substitute for priced cost. Router-only epochs are omitted.";

const TOKEN_NOTE =
  "Token totals come from stored routerUsage/agentUsage on each attempt. Router and agent series are plotted separately when router tokens are present. Router-only epochs are omitted.";

/**
 * Build Figure 2 cost series from a normalized analysis dataset alone.
 */
export function buildFigure2Cost(dataset: AnalysisDataset): Figure2CostData {
  const cells = groupFullAgentCells(dataset.attempts);
  const byArch = new Map<string, CostPoint[]>();
  for (const bucket of cells.values()) {
    assertCompatibleCell(bucket, "figure2-cost");
    const point = costPointFromAttempts(bucket);
    const list = byArch.get(point.architecture);
    if (list === undefined) byArch.set(point.architecture, [point]);
    else list.push(point);
  }

  return {
    version: 1,
    figure: "figure2-cost",
    metric: "priced_cost_usd_per_task",
    y_axis_label: "Priced Cost per Task (USD)",
    x_axis_label: "Number of Available Tools",
    pricing_version: dataset.compatibility.pricingVersion,
    note: COST_NOTE,
    series: orderedSeries(byArch),
  };
}

/**
 * Build Figure 2 token series from a normalized analysis dataset alone.
 */
export function buildFigure2Tokens(dataset: AnalysisDataset): Figure2TokenData {
  const cells = groupFullAgentCells(dataset.attempts);
  const points: TokenPoint[] = [];
  for (const bucket of cells.values()) {
    assertCompatibleCell(bucket, "figure2-tokens");
    points.push(tokenPointFromAttempts(bucket));
  }
  points.sort((left, right) => {
    const arch = archRank(left.architecture) - archRank(right.architecture);
    if (arch !== 0) return arch;
    return left.toolspace_size - right.toolspace_size;
  });

  return {
    version: 1,
    figure: "figure2-tokens",
    metric: "tokens_per_task",
    y_axis_label: "Tokens per Task",
    x_axis_label: "Number of Available Tools",
    note: TOKEN_NOTE,
    points,
    series: tokenSeriesFromPoints(points),
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure2Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure2CostToJson(data: Figure2CostData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure2TokensToJson(data: Figure2TokenData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure2CostToCsv(data: Figure2CostData): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "attempts",
    "pricing_version",
    "priced_cost_usd_total",
    "priced_cost_usd_per_task",
    "provider_reported_cost_usd_total",
    "provider_reported_attempts",
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
          point.pricing_version,
          point.priced_cost_usd_total,
          point.priced_cost_usd_per_task,
          point.provider_reported_cost_usd_total === null
            ? ""
            : point.provider_reported_cost_usd_total,
          point.provider_reported_attempts,
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function figure2TokensToCsv(data: Figure2TokenData): string {
  const headers = [
    "architecture",
    "toolspace_size",
    "top_k",
    "attempts",
    "router_input_tokens",
    "router_output_tokens",
    "router_tokens",
    "router_tokens_per_task",
    "agent_input_tokens",
    "agent_output_tokens",
    "agent_tokens",
    "agent_tokens_per_task",
    "total_tokens",
    "total_tokens_per_task",
  ];
  const lines = [headers.join(",")];
  for (const point of data.points) {
    lines.push(
      [
        point.architecture,
        point.toolspace_size,
        point.top_k === null ? "" : point.top_k,
        point.attempts,
        point.router_input_tokens,
        point.router_output_tokens,
        point.router_tokens,
        point.router_tokens_per_task,
        point.agent_input_tokens,
        point.agent_output_tokens,
        point.agent_tokens,
        point.agent_tokens_per_task,
        point.total_tokens,
        point.total_tokens_per_task,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function figure2CostToSvg(data: Figure2CostData): string {
  const plotSeries = data.series.map((series) => ({
    key: series.architecture,
    colorKey: series.architecture,
    dashed: false,
    points: series.points.map((point) => ({
      x: point.toolspace_size,
      y: point.priced_cost_usd_per_task,
    })),
  }));
  return multiLineSvg({
    title: `Figure 2a — ${data.y_axis_label} vs ${data.x_axis_label}`,
    xLabel: data.x_axis_label,
    yLabel: data.y_axis_label,
    series: plotSeries,
    yFormat: (value) => formatCost(value),
  });
}

export function figure2TokensToSvg(data: Figure2TokenData): string {
  const plotSeries = data.series.map((series) => ({
    key: series.key,
    colorKey: series.architecture,
    dashed: series.component === "router",
    points: series.points.map((point) => ({
      x: point.toolspace_size,
      y: point.tokens_per_task,
    })),
  }));
  return multiLineSvg({
    title: `Figure 2b — ${data.y_axis_label} vs ${data.x_axis_label}`,
    xLabel: data.x_axis_label,
    yLabel: data.y_axis_label,
    series: plotSeries,
    yFormat: (value) => String(Math.round(value)),
  });
}

export function writeFigure2(
  cost: Figure2CostData,
  tokens: Figure2TokenData,
  outDir: string,
): {
  costJsonPath: string;
  costCsvPath: string;
  costSvgPath: string;
  tokensJsonPath: string;
  tokensCsvPath: string;
  tokensSvgPath: string;
} {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const costJsonPath = join(root, "figure2-cost.json");
  const costCsvPath = join(root, "figure2-cost.csv");
  const costSvgPath = join(root, "figure2-cost.svg");
  const tokensJsonPath = join(root, "figure2-tokens.json");
  const tokensCsvPath = join(root, "figure2-tokens.csv");
  const tokensSvgPath = join(root, "figure2-tokens.svg");
  writeFileSync(costJsonPath, figure2CostToJson(cost));
  writeFileSync(costCsvPath, figure2CostToCsv(cost));
  writeFileSync(costSvgPath, figure2CostToSvg(cost));
  writeFileSync(tokensJsonPath, figure2TokensToJson(tokens));
  writeFileSync(tokensCsvPath, figure2TokensToCsv(tokens));
  writeFileSync(tokensSvgPath, figure2TokensToSvg(tokens));
  return {
    costJsonPath,
    costCsvPath,
    costSvgPath,
    tokensJsonPath,
    tokensCsvPath,
    tokensSvgPath,
  };
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

function costPointFromAttempts(attempts: readonly NormalizedAttempt[]): CostPoint {
  const first = attempts[0]!;
  const pricedTotal = sum(attempts.map((attempt) => attempt.priced_cost_usd));
  const providerValues = attempts
    .map((attempt) => attempt.provider_reported_cost_usd)
    .filter((value): value is number => value !== null);
  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: first.top_k,
    attempts: attempts.length,
    pricing_version: first.pricing_version,
    priced_cost_usd_total: pricedTotal,
    priced_cost_usd_per_task: pricedTotal / attempts.length,
    provider_reported_cost_usd_total: providerValues.length === 0 ? null : sum(providerValues),
    provider_reported_attempts: providerValues.length,
  };
}

function tokenPointFromAttempts(attempts: readonly NormalizedAttempt[]): TokenPoint {
  const first = attempts[0]!;
  const routerIn = sum(attempts.map((attempt) => attempt.router_input_tokens));
  const routerOut = sum(attempts.map((attempt) => attempt.router_output_tokens));
  const agentIn = sum(attempts.map((attempt) => attempt.agent_input_tokens));
  const agentOut = sum(attempts.map((attempt) => attempt.agent_output_tokens));
  const routerTokens = routerIn + routerOut;
  const agentTokens = agentIn + agentOut;
  const n = attempts.length;
  return {
    architecture: first.architecture,
    toolspace_size: first.toolspace_size,
    top_k: first.top_k,
    attempts: n,
    router_input_tokens: routerIn,
    router_output_tokens: routerOut,
    router_tokens: routerTokens,
    router_tokens_per_task: routerTokens / n,
    agent_input_tokens: agentIn,
    agent_output_tokens: agentOut,
    agent_tokens: agentTokens,
    agent_tokens_per_task: agentTokens / n,
    total_tokens: routerTokens + agentTokens,
    total_tokens_per_task: (routerTokens + agentTokens) / n,
  };
}

function tokenSeriesFromPoints(points: readonly TokenPoint[]): TokenSeries[] {
  const series: TokenSeries[] = [];
  for (const architecture of ARCH_ORDER) {
    const archPoints = points.filter((point) => point.architecture === architecture);
    if (archPoints.length === 0) continue;
    const hasRouter = archPoints.some((point) => point.router_tokens > 0);
    if (hasRouter) {
      series.push({
        key: `${architecture}-router`,
        architecture,
        component: "router",
        points: archPoints.map((point) => ({
          toolspace_size: point.toolspace_size,
          tokens_per_task: point.router_tokens_per_task,
          tokens_total: point.router_tokens,
        })),
      });
    }
    series.push({
      key: `${architecture}-agent`,
      architecture,
      component: "agent",
      points: archPoints.map((point) => ({
        toolspace_size: point.toolspace_size,
        tokens_per_task: point.agent_tokens_per_task,
        tokens_total: point.agent_tokens,
      })),
    });
  }
  return series;
}

function orderedSeries<T extends { architecture: string; toolspace_size: number }>(
  byArch: Map<string, T[]>,
): Array<{ architecture: string; points: T[] }> {
  const series: Array<{ architecture: string; points: T[] }> = [];
  for (const architecture of ARCH_ORDER) {
    const points = byArch.get(architecture);
    if (points === undefined) continue;
    points.sort((left, right) => left.toolspace_size - right.toolspace_size);
    series.push({ architecture, points });
  }
  return series;
}

function assertCompatibleCell(attempts: readonly NormalizedAttempt[], label: string): void {
  const first = attempts[0]!;
  for (const attempt of attempts.slice(1)) {
    if (attempt.architecture !== first.architecture) {
      throw new Figure2Error(`architecture mismatch within ${label} cell`);
    }
    if (attempt.toolspace_size !== first.toolspace_size) {
      throw new Figure2Error(`toolspace_size mismatch within ${label} cell`);
    }
    if (attempt.top_k !== first.top_k) {
      throw new Figure2Error(
        `top_k mismatch for ${first.architecture} n=${first.toolspace_size}: ${first.top_k} vs ${attempt.top_k}`,
      );
    }
    if (attempt.pricing_version !== first.pricing_version) {
      throw new Figure2Error(
        `pricing_version mismatch for ${first.architecture} n=${first.toolspace_size}: ${first.pricing_version} vs ${attempt.pricing_version}`,
      );
    }
  }
}

function isPlotArchitecture(architecture: string): boolean {
  return architecture === "baseline" || architecture === "jev" || architecture === "llm";
}

function archRank(architecture: string): number {
  const index = (ARCH_ORDER as readonly string[]).indexOf(architecture);
  return index === -1 ? 99 : index;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function multiLineSvg(options: {
  title: string;
  xLabel: string;
  yLabel: string;
  series: Array<{
    key: string;
    colorKey: string;
    dashed: boolean;
    points: Array<{ x: number; y: number }>;
  }>;
  yFormat: (value: number) => string;
}): string {
  const width = 760;
  const height = 440;
  const margin = { top: 40, right: 160, bottom: 56, left: 72 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allPoints = options.series.flatMap((series) => series.points);
  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  const xMin = xs.length === 0 ? 0 : Math.min(...xs);
  const xMax = xs.length === 0 ? 1 : Math.max(...xs);
  const yMin = 0;
  const yMax = ys.length === 0 ? 1 : Math.max(...ys, 0);
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
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">${escapeXml(options.title)}</text>`,
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
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${escapeXml(options.yFormat(value))}</text>`,
    );
  }

  for (const tick of uniqueSorted(xs)) {
    const x = xScale(tick);
    parts.push(
      `<text x="${x}" y="${margin.top + plotH + 20}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#333">${tick}</text>`,
    );
  }

  parts.push(
    `<text x="${margin.left + plotW / 2}" y="${height - 16}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(options.xLabel)}</text>`,
  );
  parts.push(
    `<text x="18" y="${margin.top + plotH / 2}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" transform="rotate(-90 18 ${margin.top + plotH / 2})">${escapeXml(options.yLabel)}</text>`,
  );

  options.series.forEach((series, seriesIndex) => {
    if (series.points.length === 0) return;
    const color = colors[series.colorKey] ?? palette(seriesIndex);
    const dash = series.dashed ? ' stroke-dasharray="6 4"' : "";
    const path = series.points
      .map((point, index) => {
        const x = xScale(point.x);
        const y = yScale(point.y);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"${dash}/>`);
    for (const point of series.points) {
      const x = xScale(point.x);
      const y = yScale(point.y);
      parts.push(
        series.dashed
          ? `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>`
          : `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`,
      );
    }

    const legendY = margin.top + 16 + seriesIndex * 20;
    const legendX = margin.left + plotW + 12;
    parts.push(
      `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="${color}" stroke-width="2"${dash}/>`,
    );
    parts.push(
      series.dashed
        ? `<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="#fff" stroke="${color}" stroke-width="2"/>`
        : `<circle cx="${legendX + 9}" cy="${legendY}" r="3" fill="${color}"/>`,
    );
    parts.push(
      `<text x="${legendX + 26}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" fill="#222">${escapeXml(series.key)}</text>`,
    );
  });

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

function formatCost(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(3);
  return value.toExponential(1);
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
