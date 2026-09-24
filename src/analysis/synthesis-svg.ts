import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type SynthesisFigureJson =
  | {
      id: string;
      title: string;
      kind: "line";
      x_label: string;
      y_label: string;
      series: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
    }
  | {
      id: string;
      title: string;
      kind: "grouped_bar";
      x_label: string;
      y_label: string;
      categories: string[];
      groups: Array<{ name: string; values: number[] }>;
    }
  | {
      id: string;
      title: string;
      kind: "scatter";
      x_label: string;
      y_label: string;
      points: Array<{ x: number; y: number; label: string }>;
    }
  | {
      id: string;
      title: string;
      kind: "table";
      columns: string[];
      rows: string[][];
    };

const COLORS = ["#1b1b1b", "#c45c26", "#2f6f4e", "#3b5bdb", "#8b5a2b"];

export function renderSynthesisSvgs(
  figures: Record<string, SynthesisFigureJson>,
  outDir: string,
): void {
  for (const [id, figure] of Object.entries(figures)) {
    // Skip reproducibility table SVG (optional) — still emit a simple table SVG
    const svg = renderFigureSvg(figure);
    writeFileSync(join(outDir, `${id}.svg`), svg);
  }
}

export function renderFigureSvg(figure: SynthesisFigureJson): string {
  switch (figure.kind) {
    case "line":
      return renderLine(figure);
    case "grouped_bar":
      return renderGroupedBar(figure);
    case "scatter":
      return renderScatter(figure);
    case "table":
      return renderTable(figure);
  }
}

function renderLine(figure: Extract<SynthesisFigureJson, { kind: "line" }>): string {
  const width = 720;
  const height = 420;
  const pad = { top: 48, right: 160, bottom: 56, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const all = figure.series.flatMap((s) => s.points);
  if (all.length === 0) return emptySvg(figure.title, width, height);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = 0;
  const yMax = Math.max(1, ...ys) * 1.05;
  const xScale = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (y: number) => pad.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  const paths = figure.series.map((series, i) => {
    const d = series.points
      .map((p, idx) => `${idx === 0 ? "M" : "L"}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`)
      .join(" ");
    const color = COLORS[i % COLORS.length]!;
    const dots = series.points
      .map(
        (p) =>
          `<circle cx="${xScale(p.x).toFixed(1)}" cy="${yScale(p.y).toFixed(1)}" r="3.5" fill="${color}" />`,
      )
      .join("");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" />${dots}`;
  });

  const legend = figure.series
    .map((series, i) => {
      const y = pad.top + i * 18;
      const color = COLORS[i % COLORS.length]!;
      return `<rect x="${width - pad.right + 12}" y="${y}" width="12" height="3" fill="${color}" />
        <text x="${width - pad.right + 30}" y="${y + 5}" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(series.name)}</text>`;
    })
    .join("");

  return svgShell(
    width,
    height,
    figure.title,
    figure.x_label,
    figure.y_label,
    pad,
    `${axis(pad, plotW, plotH)}${paths.join("")}${legend}`,
  );
}

function renderGroupedBar(
  figure: Extract<SynthesisFigureJson, { kind: "grouped_bar" }>,
): string {
  const width = 720;
  const height = 420;
  const pad = { top: 48, right: 140, bottom: 56, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const cats = figure.categories;
  const groups = figure.groups;
  const maxV = Math.max(1, ...groups.flatMap((g) => g.values));
  const groupWidth = plotW / Math.max(1, cats.length);
  const barWidth = (groupWidth * 0.7) / Math.max(1, groups.length);

  const bars = cats
    .map((cat, ci) =>
      groups
        .map((g, gi) => {
          const v = g.values[ci] ?? 0;
          const h = (v / maxV) * plotH;
          const x = pad.left + ci * groupWidth + groupWidth * 0.15 + gi * barWidth;
          const y = pad.top + plotH - h;
          const color = COLORS[gi % COLORS.length]!;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" />
            <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 28}" text-anchor="middle" font-size="11" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(cat)}</text>`;
        })
        .join(""),
    )
    .join("");

  const legend = groups
    .map((g, i) => {
      const y = pad.top + i * 18;
      const color = COLORS[i % COLORS.length]!;
      return `<rect x="${width - pad.right + 12}" y="${y}" width="12" height="12" fill="${color}" />
        <text x="${width - pad.right + 30}" y="${y + 11}" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(g.name)}</text>`;
    })
    .join("");

  return svgShell(
    width,
    height,
    figure.title,
    figure.x_label,
    figure.y_label,
    pad,
    `${axis(pad, plotW, plotH)}${bars}${legend}`,
  );
}

function renderScatter(figure: Extract<SynthesisFigureJson, { kind: "scatter" }>): string {
  const width = 720;
  const height = 420;
  const pad = { top: 48, right: 200, bottom: 56, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  if (figure.points.length === 0) return emptySvg(figure.title, width, height);
  const xs = figure.points.map((p) => p.x);
  const ys = figure.points.map((p) => p.y);
  const xMin = 0;
  const xMax = Math.max(...xs) * 1.1;
  const yMin = Math.min(...ys) * 0.95;
  const yMax = Math.max(...ys) * 1.05;
  const xScale = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (y: number) => pad.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  const dots = figure.points
    .map((p, i) => {
      const color = COLORS[i % COLORS.length]!;
      return `<circle cx="${xScale(p.x).toFixed(1)}" cy="${yScale(p.y).toFixed(1)}" r="5" fill="${color}" />
        <text x="${(xScale(p.x) + 8).toFixed(1)}" y="${(yScale(p.y) - 6).toFixed(1)}" font-size="10" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(p.label)}</text>`;
    })
    .join("");

  return svgShell(
    width,
    height,
    figure.title,
    figure.x_label,
    figure.y_label,
    pad,
    `${axis(pad, plotW, plotH)}${dots}`,
  );
}

function renderTable(figure: Extract<SynthesisFigureJson, { kind: "table" }>): string {
  const width = 720;
  const rowH = 28;
  const height = 80 + (figure.rows.length + 1) * rowH;
  const colW = width / Math.max(1, figure.columns.length);
  const header = figure.columns
    .map(
      (c, i) =>
        `<text x="${(i * colW + 12).toFixed(1)}" y="70" font-size="13" font-weight="600" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(c)}</text>`,
    )
    .join("");
  const body = figure.rows
    .map((row, ri) =>
      row
        .map(
          (cell, ci) =>
            `<text x="${(ci * colW + 12).toFixed(1)}" y="${(98 + ri * rowH).toFixed(1)}" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(cell)}</text>`,
        )
        .join(""),
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fbfaf7"/>
  <text x="24" y="32" font-size="16" font-weight="600" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(figure.title)}</text>
  ${header}${body}
</svg>
`;
}

function svgShell(
  width: number,
  height: number,
  title: string,
  xLabel: string,
  yLabel: string,
  pad: { top: number; right: number; bottom: number; left: number },
  body: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fbfaf7"/>
  <text x="24" y="28" font-size="16" font-weight="600" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(title)}</text>
  <text x="${(width / 2).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(xLabel)}</text>
  <text transform="translate(18 ${(height / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(yLabel)}</text>
  ${body}
</svg>
`;
}

function axis(
  pad: { top: number; right: number; bottom: number; left: number },
  plotW: number,
  plotH: number,
): string {
  const x0 = pad.left;
  const y0 = pad.top + plotH;
  const x1 = pad.left + plotW;
  const y1 = pad.top;
  return `<path d="M${x0} ${y1} V${y0} H${x1}" fill="none" stroke="#222" stroke-width="1.25" />`;
}

function emptySvg(title: string, width: number, height: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fbfaf7"/>
  <text x="24" y="32" font-size="16" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">${escapeXml(title)}</text>
  <text x="24" y="60" font-size="12" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">No points</text>
</svg>
`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
