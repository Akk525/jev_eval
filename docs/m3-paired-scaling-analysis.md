# M3 paired scaling analysis (offline)

Source: frozen live matrix `2026-09-24T055854Z` @ `fc9fb2a`.  
Machine artifact: [`analysis/m3-freeze/paired-scaling-analysis.json`](../analysis/m3-freeze/paired-scaling-analysis.json).  
Companion: [`live-results.json`](../analysis/m3-freeze/live-results.json).

**Scope.** Observed paired differences on 78 shared task IDs × 1 repetition.  
No equivalence claims. No retune. No new runs.

---

## 1. Scaling series (cell aggregates)

### ESR vs N

| N | Baseline | Top-1 | Top-5 |
|---:|---:|---:|---:|
| 5 | 0.808 | 0.769 | 0.821 |
| 10 | 0.782 | 0.753 | 0.782 |
| 25 | 0.744 | 0.705 | 0.769 |
| 50 | 0.769 | 0.705 | 0.756 |
| 100 | 0.769 | 0.692 | 0.756 |

Baseline does **not** collapse with N. Top-5 stays within a few points of baseline; top-1 lags as Recall@1 drops.

### Cost $/attempt vs N

| N | Baseline | Top-1 | Top-5 |
|---:|---:|---:|---:|
| 5 | 0.00145 | 0.00101 | 0.00146 |
| 10 | 0.00196 | 0.00100 | 0.00142 |
| 25 | 0.00362 | 0.00104 | 0.00148 |
| 50 | 0.00644 | 0.00106 | 0.00151 |
| 100 | 0.01224 | 0.00110 | 0.00157 |

Baseline **~8.4×** from N=5→100. Top-5 **~1.08×**. At N=100, baseline $/attempt is **~7.8×** top-5 (observed).

### Mean agent tokens vs N

| N | Baseline | Top-1 | Top-5 |
|---:|---:|---:|---:|
| 5 | 282 | 169 | 282 |
| 100 | 2982 | 169 | 290 |

Top-5 keeps agent context flat; router tokens absorb growth (~451→3036).

### Mean totalLatencyMs (non-R0) vs N

| N | Baseline | Top-1 | Top-5 | Top-5 − Baseline |
|---:|---:|---:|---:|---:|
| 5 | 1278 | 1855 | 1624 | **+346** |
| 10 | 1701 | 2012 | 1792 | +91 |
| 25 | 1464 | 1716 | 2052 | **+588** |
| 50 | 1475 | 1523 | 1833 | +357 |
| 100 | 1954 | 1593 | 1741 | **−212** |

Routing is often **slower** at small/mid N; at N=100 top-5 mean total latency is **below** baseline in this sample. Not a clean monotonic crossover (N=25 spike).

---

## 2. N=100 paired disagreement (baseline × top-5)

Same 78 tasks:

|  | Top-5 success | Top-5 failure |
|---|---:|---:|
| **Baseline success** | **54** | **6** |
| **Baseline failure** | **5** | **13** |

Cell ESR: baseline 0.769 (60/78) vs top-5 0.756 (59/78) — **1.3 pp / 1 task** net.  
The contingency shows **11 disagreements** (6+5), not a one-sided dominance.

### Rescued by top-5 (baseline fail → top-5 ok): 5

| Task | Baseline | Top-5 |
|---|---|---|
| task_0022 | R2 | ok (R@5=1, sel=1) |
| task_0023 | R2 | ok |
| task_0030 | R2 | ok |
| task_0057 | R3 | ok |
| task_0072 | R2 | ok |

Four of five rescues are baseline **R2** selection errors at full toolspace.

### Lost by top-5 (baseline ok → top-5 fail): 6

| Task | Top-5 | Notes |
|---|---|---|
| task_0028 | R3 | also R3 under top-1 |
| task_0034 | R2 | gold in top-5 (R@5=1), agent miss; top-1 ok |
| task_0040 | R1 | routing miss; top-1 “ok” with R@1=0 (acceptable-tool path) |
| task_0041 | R1 | also R1 under top-1 |
| task_0043 | R2 | gold in set; top-1 was R1 |
| task_0045 | R4 | also R4 under top-1 |

Net: top-5 trades some routing/selection/tool failures for fixing baseline overload R2s.

---

## 3. Baseline flips as N grows

Tasks **ok at N=5, fail at N=100**: **7**

| Task | Fail@100 | Pattern |
|---|---|---|
| task_0022, 0023, 0038, 0039, 0042, 0072 | **R2** | selection under larger toolspace |
| task_0057 | R3 | rare flip to args failure |

Of baseline N=100 failures (18): **R2×11, R3×7**. Growth in misses is mostly **selection (R2)**, not a new R3 epidemic.

---

## 4. R3 / R4 overlap (orthogonal to routing?)

**R3 ≈ 7–8 in every cell.** Six tasks are R3 in **all 15 cells**:

`task_0001, 0006, 0051, 0059, 0062, 0066`

Plus `task_0028` in 14/15. At each N, the three-architecture R3 intersection is almost the full R3 set.

→ Argument failures look like a **fixed task subset**, not a routing treatment effect.

**R4** is more architecture-sensitive but still concentrated: `task_0045` (11/15), `0077` (11), `0078` (9), `0074` (8).

---

## 5. Top-1 vs top-5 failure-mode tradeoff

Top-1: **selection accuracy = 1.000** everywhere when gold is the sole candidate. Failures are almost all **R1** (and shared R3/R4).

Recall@1: 0.923 → 0.909 → 0.872 → 0.859 → 0.872.

Top-5: Recall@5 stays high (1.00 → 0.949); **R2 returns** when the agent chooses among five.

At N=100: top-1 R1=9 R2=0; top-5 R1=4 R2=4.

R1 task sets grow with N for top-1; top-5 R1 appears from N=25 (`0039, 0040, 0042`) and adds `0041` at N=100. Only `task_0039` is an R1 miss for top-1 at both N=5 and N=100.

---

## 6. Cost–ESR frontier (observed points)

Each (architecture, N) is one point. At N=100:

| Point | $/attempt | ESR |
|---|---:|---:|
| Top-1 | 0.00110 | 0.692 |
| Top-5 | 0.00157 | 0.756 |
| Baseline | 0.01224 | 0.769 |

Framing for later analysis (not a winner declaration): how much ESR is bought per unit cost, with paired uncertainty acknowledged (n=78, r=1).

---

## 7. Implications for M4 (no k retune)

M3 suggests the informative **fixed-N setting for a predeclared k-ablation** is where:

- baseline cost has clearly separated from routed cost, and  
- latency may favor routing, and  
- R1/R2 tradeoff is visible  

**N=100** is the strongest such observed setting in this freeze; **N=50** is a cheaper alternative with similar ESR shape. Choice is deferred to freeze review — do not retune k from this analysis.

---

## Integrity notes

- Paired on identical task IDs; one R0 (`jev-top1-n10` / `task_0025`) excluded from that cell’s ESR denominator per freeze policy.
- `task_0040` under top-1 can “succeed” with Recall@1=0 via acceptable tools — keep distinct from routing hits when interpreting rescues/losses.
