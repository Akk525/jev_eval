#!/usr/bin/env python3
"""Render publication PNGs from the frozen synthesis figure payloads."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, ScalarFormatter

ROOT = Path(__file__).resolve().parents[1]
PAYLOADS = ROOT / "analysis" / "synthesis" / "figures"
OUTPUT = Path(__file__).resolve().parent / "figures"

COLORS = {
    "baseline": "#333333",
    "jev_top1": "#0072B2",
    "jev_top5": "#D55E00",
    "strict Recall@k": "#009E73",
    "ESR": "#0072B2",
    "selection accuracy": "#D55E00",
    "R1": "#CC79A7",
    "R2": "#E69F00",
}
LABELS = {
    "baseline": "Baseline (all tools)",
    "jev_top1": "Jev top-1",
    "jev_top5": "Jev top-5",
    "strict Recall@k": "Strict Recall@$k$",
    "ESR": "Execution success",
    "selection accuracy": "Selection accuracy",
    "R1": "R1: routing",
    "R2": "R2: selection",
}


def load(name: str) -> dict:
    with (PAYLOADS / f"{name}.json").open() as handle:
        return json.load(handle)


def finish(fig: mpl.figure.Figure, filename: str) -> None:
    fig.savefig(OUTPUT / filename, dpi=300, bbox_inches="tight", pad_inches=0.03, facecolor="white")
    plt.close(fig)


def line_plot(payload_name: str, filename: str, ylabel: str, *, percent: bool = False,
              scientific_y: bool = False) -> None:
    payload = load(payload_name)
    fig, ax = plt.subplots(figsize=(4.8, 3.15))
    for series in payload["series"]:
        x = [point["x"] for point in series["points"]]
        y = [point["y"] for point in series["points"]]
        ax.plot(x, y, marker="o", markersize=4.4, linewidth=1.8,
                color=COLORS[series["name"]], label=LABELS[series["name"]])
    ax.set_xlabel("Toolspace size, $N$ (tools)")
    ax.set_ylabel(ylabel)
    ax.set_xticks([5, 10, 25, 50, 100])
    if percent:
        ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.0%}"))
    if scientific_y:
        formatter = ScalarFormatter(useMathText=True)
        formatter.set_powerlimits((-3, -3))
        ax.yaxis.set_major_formatter(formatter)
    ax.legend(loc="best")
    finish(fig, filename)


def k_ablation() -> None:
    payload = load("k-ablation")
    fig, ax = plt.subplots(figsize=(4.8, 3.15))
    for series in payload["series"]:
        x = [point["x"] for point in series["points"]]
        y = [point["y"] for point in series["points"]]
        ax.plot(x, y, marker="o", markersize=4.4, linewidth=1.8,
                color=COLORS[series["name"]], label=LABELS[series["name"]])
    ax.set_xlabel("Candidate-set size, $k$ (tools)")
    ax.set_ylabel("Rate (fraction of eligible attempts)")
    ax.set_xticks([1, 3, 5, 10])
    ax.set_ylim(0.65, 1.02)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.0%}"))
    ax.legend(loc="lower right")
    finish(fig, "k-ablation.png")


def failure_decomposition() -> None:
    payload = load("failure-decomposition")
    categories = [int(value) for value in payload["categories"]]
    fig, ax = plt.subplots(figsize=(4.8, 3.15))
    positions = list(range(len(categories)))
    width = 0.36
    for index, group in enumerate(payload["groups"]):
        offset = (index - 0.5) * width
        bars = ax.bar([position + offset for position in positions], group["values"], width,
                      color=COLORS[group["name"]], label=LABELS[group["name"]])
        ax.bar_label(bars, padding=2, fontsize=8)
    ax.set_xlabel("Candidate-set size, $k$ (tools)")
    ax.set_ylabel("Failures (tasks, out of 78)")
    ax.set_xticks(positions, categories)
    ax.set_ylim(0, 10.5)
    ax.legend(loc="upper right")
    finish(fig, "failure-decomposition.png")


def operating_points() -> None:
    payload = load("cost-esr-frontier")
    fig, ax = plt.subplots(figsize=(4.8, 3.25))
    display = {
        "baseline_n100": "M3 baseline", "jev_k1_n100": "M3 top-1",
        "jev_k5_n100": "M3 top-5", "m4_jev_k1_n100": "M4 $k=1$",
        "m4_jev_k3_n100": "M4 $k=3$", "m4_jev_k5_n100": "M4 $k=5$",
        "m4_jev_k10_n100": "M4 $k=10$",
    }
    offsets = {
        "baseline_n100": (-40, 8), "jev_k1_n100": (6, -12),
        "jev_k5_n100": (6, 13), "m4_jev_k1_n100": (6, 8),
        "m4_jev_k3_n100": (6, -12), "m4_jev_k5_n100": (6, -12),
        "m4_jev_k10_n100": (6, 7),
    }
    for point in payload["points"]:
        is_baseline = point["label"] == "baseline_n100"
        is_m4 = point["label"].startswith("m4_")
        color = "#333333" if is_baseline else ("#0072B2" if is_m4 else "#D55E00")
        marker = "s" if is_m4 else "o"
        ax.scatter(point["x"], point["y"], s=35, marker=marker, color=color, zorder=3)
        ax.annotate(display[point["label"]], (point["x"], point["y"]),
                    xytext=offsets[point["label"]], textcoords="offset points", fontsize=7.5,
                    arrowprops={"arrowstyle": "-", "color": "0.55", "lw": 0.6})
    ax.set_xlabel("Priced inference cost (USD / attempt)")
    ax.set_ylabel("Execution success rate (fraction)")
    formatter = ScalarFormatter(useMathText=True)
    formatter.set_powerlimits((-3, -3))
    ax.xaxis.set_major_formatter(formatter)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.0%}"))
    ax.margins(x=0.08, y=0.18)
    finish(fig, "cost-esr-operating-points.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    mpl.rcParams.update({
        "font.family": "sans-serif", "font.size": 9, "axes.labelsize": 9,
        "legend.fontsize": 7.5, "xtick.labelsize": 8, "ytick.labelsize": 8,
        "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
        "axes.axisbelow": True, "grid.color": "#D9D9D9", "grid.linewidth": 0.55,
        "grid.alpha": 0.8, "figure.constrained_layout.use": True,
    })
    line_plot("esr-vs-n", "esr-vs-n.png", "Execution success rate (fraction)", percent=True)
    line_plot("cost-vs-n", "cost-vs-n.png", "Priced inference cost (USD / attempt)", scientific_y=True)
    line_plot("agent-tokens-vs-n", "agent-tokens-vs-n.png", "Mean downstream context (tokens / attempt)")
    k_ablation()
    failure_decomposition()
    operating_points()


if __name__ == "__main__":
    main()
