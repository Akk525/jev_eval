import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  calibrateProbabilities,
  type ProbabilityCalibrationSummary,
  type ProbabilitySample,
} from "../metrics/aggregate.js";
import type { AnalysisDataset, NormalizedAttempt } from "./dataset.js";

export interface Figure5Data {
  version: 1;
  figure: "figure5";
  architecture: "jev";
  y_axis_label: "Empirical hit rate (Recall@k === 1)";
  x_axis_label: "Mean predicted probability in bucket";
  note: string;
  jev_attempts: number;
  /**
   * Provider-reported confidence vs empirical routing hits.
   * Attempts without confidence stay out of this denominator.
   */
  confidence: ProbabilityCalibrationSummary;
  /**
   * Top-1 choice probability vs empirical routing hits.
   * Separate from confidence (D4) — never combined into one metric.
   */
  top1_probability: ProbabilityCalibrationSummary;
}

export class Figure5Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Figure5Error";
  }
}

const FIGURE5_NOTE =
  "Reliability diagram for Jev only. Provider confidence and top-1 probability are calibrated separately against primary Recall@k === 1 (D4). No combined confidence metric. ECE uses the same fixed buckets as summary.json calibration. Attempts missing the respective score stay out of that series' denominator.";

/**
 * Build Figure 5 calibration panels from a normalized analysis dataset alone.
 */
export function buildFigure5(dataset: AnalysisDataset): Figure5Data {
  const jev = dataset.attempts.filter((attempt) => attempt.architecture === "jev");
  return {
    version: 1,
    figure: "figure5",
    architecture: "jev",
    y_axis_label: "Empirical hit rate (Recall@k === 1)",
    x_axis_label: "Mean predicted probability in bucket",
    note: FIGURE5_NOTE,
    jev_attempts: jev.length,
    confidence: calibrateProbabilities(samplesFor(jev, "confidence")),
    top1_probability: calibrateProbabilities(samplesFor(jev, "top1")),
  };
}

export function loadAnalysisDatasetFile(path: string): AnalysisDataset {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as AnalysisDataset;
  if (raw.version !== 1 || !Array.isArray(raw.attempts)) {
    throw new Figure5Error(`invalid analysis dataset at ${path}`);
  }
  return raw;
}

export function figure5ToJson(data: Figure5Data): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function figure5ToCsv(data: Figure5Data): string {
  const headers = [
    "series",
    "range",
    "n",
    "mean_probability",
    "empirical_hit_rate",
    "ece",
    "scored",
  ];
  const lines = [headers.join(",")];
  for (const [series, summary] of [
    ["confidence", data.confidence],
    ["top1_probability", data.top1_probability],
  ] as const) {
    if (summary.buckets.length === 0) {
      lines.push(
        [
          series,
          "",
          0,
          "",
          "",
          summary.ece === null ? "" : summary.ece,
          summary.scored,
        ].join(","),
      );
      continue;
    }
    for (const bucket of summary.buckets) {
      lines.push(
        [
          series,
          bucket.range,
          bucket.n,
          bucket.mean_probability,
          bucket.empirical_hit_rate,
          summary.ece === null ? "" : summary.ece,
          summary.scored,
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Reliability diagram: confidence (solid) and top-1 (dashed) as separate series. */
export function figure5ToSvg(data: Figure5Data): string {
  const width = 520;
  const height = 480;
  const margin = { top: 48, right: 24, bottom: 64, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const scale = (value: number) => margin.left + value * plotW;
  const yScale = (value: number) => margin.top + (1 - value) * plotH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<text x="${width / 2}" y="22" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600">Figure 5 — Jev calibration (confidence vs top-1)</text>`,
  );
  const eceConfidence = data.confidence.ece === null ? "n/a" : data.confidence.ece.toFixed(3);
  const eceTop1 = data.top1_probability.ece === null ? "n/a" : data.top1_probability.ece.toFixed(3);
  parts.push(
    `<text x="${width / 2}" y="40" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#555">ECE confidence=${eceConfidence} · ECE top-1=${eceTop1} (separate; D4)</text>`,
  );

  // diagonal
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top}" stroke="#bbbbbb" stroke-width="1" stroke-dasharray="4 3"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`,
  );

  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const x = scale(tick);
    const y = yScale(tick);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#eee" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" stroke="#eee" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${tick.toFixed(2)}</text>`,
    );
    parts.push(
      `<text x="${x}" y="${margin.top + plotH + 18}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${tick.toFixed(2)}</text>`,
    );
  }

  parts.push(
    `<text x="${margin.left + plotW / 2}" y="${height - 18}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(data.x_axis_label)}</text>`,
  );
  parts.push(
    `<text x="18" y="${margin.top + plotH / 2}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" transform="rotate(-90 18 ${margin.top + plotH / 2})">${escapeXml(data.y_axis_label)}</text>`,
  );

  drawSeries(parts, data.confidence, "#c45c26", false, scale, yScale);
  drawSeries(parts, data.top1_probability, "#1f4e79", true, scale, yScale);

  // legend
  const legendY = margin.top + 12;
  parts.push(`<line x1="${margin.left + 8}" y1="${legendY}" x2="${margin.left + 28}" y2="${legendY}" stroke="#c45c26" stroke-width="2"/>`);
  parts.push(`<circle cx="${margin.left + 18}" cy="${legendY}" r="3.5" fill="#c45c26"/>`);
  parts.push(
    `<text x="${margin.left + 34}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">confidence</text>`,
  );
  parts.push(
    `<line x1="${margin.left + 120}" y1="${legendY}" x2="${margin.left + 140}" y2="${legendY}" stroke="#1f4e79" stroke-width="2" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<circle cx="${margin.left + 130}" cy="${legendY}" r="3.5" fill="#fff" stroke="#1f4e79" stroke-width="2"/>`,
  );
  parts.push(
    `<text x="${margin.left + 146}" y="${legendY + 4}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">top-1 probability</text>`,
  );

  parts.push(`</svg>\n`);
  return parts.join("\n");
}

export function writeFigure5(
  data: Figure5Data,
  outDir: string,
): { jsonPath: string; csvPath: string; svgPath: string } {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const jsonPath = join(root, "figure5-calibration.json");
  const csvPath = join(root, "figure5-calibration.csv");
  const svgPath = join(root, "figure5-calibration.svg");
  writeFileSync(jsonPath, figure5ToJson(data));
  writeFileSync(csvPath, figure5ToCsv(data));
  writeFileSync(svgPath, figure5ToSvg(data));
  return { jsonPath, csvPath, svgPath };
}

function samplesFor(
  attempts: readonly NormalizedAttempt[],
  kind: "confidence" | "top1",
): ProbabilitySample[] {
  const samples: ProbabilitySample[] = [];
  for (const attempt of attempts) {
    if (attempt.routing_excluded || attempt.recall_at_k === null) continue;
    const probability = kind === "confidence" ? attempt.confidence : attempt.top1_probability;
    if (probability === null) continue;
    samples.push({
      probability,
      hit: attempt.recall_at_k === 1,
    });
  }
  return samples;
}

function drawSeries(
  parts: string[],
  summary: ProbabilityCalibrationSummary,
  color: string,
  dashed: boolean,
  scale: (value: number) => number,
  yScale: (value: number) => number,
): void {
  if (summary.buckets.length === 0) return;
  const dash = dashed ? ' stroke-dasharray="6 4"' : "";
  const path = summary.buckets
    .map((bucket, index) => {
      const x = scale(bucket.mean_probability);
      const y = yScale(bucket.empirical_hit_rate);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"${dash}/>`);
  for (const bucket of summary.buckets) {
    const x = scale(bucket.mean_probability);
    const y = yScale(bucket.empirical_hit_rate);
    parts.push(
      dashed
        ? `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="${color}" stroke-width="2"/>`
        : `<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`,
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
