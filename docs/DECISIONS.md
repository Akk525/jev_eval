# Decisions

Architectural choices future sessions should not casually reverse. Status is Accepted unless noted. The research brief is [BRIEF.md](BRIEF.md). Where they differ, this file wins.

---

## D1. Per-task nested, difficulty-aware toolspaces

**Decision.** For a task and a toolspace size `N`, the presented toolspace is:

```text
toolspace(task, N) = required_tools ∪ prefix(distractor_sequence(task), N − |required_tools|)
```

The same task is eligible at N = 5, 10, 25, 50, and 100, and its required tools are always present. Nesting holds per task:

```text
toolspace(task, 5) ⊂ toolspace(task, 10) ⊂ toolspace(task, 25) ⊂ toolspace(task, 50) ⊂ toolspace(task, 100)
```

The distractor sequence is frozen in the registry, not sampled at runtime.

Construction:

1. Each tool declares a frozen `nearMisses` list: same-domain confusable tools first, then cross-domain confusable tools. Example: `search_email` lists `search_files` and `read_email` before unrelated tools.
2. Tools not named in that list follow one global frozen tail. The tail interleaves domains. It is a tie-break, not the difficulty mechanism.
3. For a task, merge the `nearMisses` lists of its required tools by round-robin, with tool-name tie-breaks. Append the global tail, skipping any tool already required or already emitted.
4. If `|required_tools| > N`, the task is ineligible at that N. Record it as not run. Do not score it as a failure. Single-tool tasks are eligible at every supported N.

Every run record stores the exact ordered tool list presented.

`nearMisses` and the global tail are experimental data. Changing either changes the registry version/hash.

**Reason.** A single global prefix of 5 tools cannot contain every gold tool in a 20- or 100-tool dataset, so small-N runs would score a different task set. A random distractor sample is not reproducible. A global order that puts unrelated tools first would hide the selection problem the study is about. Per-task prefixes keep the task fixed, keep the required tool present, and put confusable tools in the early positions for that task. Nesting then means "add tools," not "swap the set."

**Alternatives considered.**

* One global tool set of size N shared by every task. Rejected: N = 5 cannot cover the gold tools of the full dataset, so the scaling curve would compare different tasks.
* Resample distractors per run from a seed. Rejected: the seed would have to be frozen anyway, and a random prefix is not difficulty-aware.
* Put all semantically similar tools in one global block at the front. Rejected: that block is confusable only for tasks whose gold tool sits in the block.

**Consequences.** The registry must ship `nearMisses` before the first real run. Authors write those lists from tool descriptions, not from Jev or LLM scores. The runner must not special-case "N equals registry size" by skipping this function. Scaling issues consume this rule. They do not invent another sampler.

**Date.** 2026-09-23

---

## D2. Routers see `routingSummary`. The agent sees full schemas.

**Decision.** Every tool definition includes `routingSummary`. Jev and the LLM router both rank from that frozen text, and from no other tool text. The downstream agent receives the full definition, including JSON Schema, for its candidate tools only. The baseline agent receives full definitions for all N tools in the presented toolspace.

`routingSummary` is versioned experimental data. Any edit changes the registry version/hash.

Jev top-k is a local sort of one Choice distribution over those summaries. It is not a separate top-k API and not k independent calls. Committed configs pin a Jev model id. `jev-latest` is rejected.

**Reason.** The study compares architectures, not prompt variants. If Jev received full schemas, its input would grow like the baseline prompt and the cost question would be confounded. If the LLM router saw different text than Jev, the router comparison would be confounded. Full schemas remain what the reasoning agent must select from, which is the production condition under test.

**Alternatives considered.**

* Send full JSON schemas to every router. Rejected for the cost confound above.
* Let each router author its own tool blurb. Rejected because it is an uncontrolled prompt difference.
* Ask Jev for a top-k list in prose. Rejected because Choice already returns a distribution over up to 255 options, and prose parsing would add a failure mode the model does not have.

**Consequences.** Registry hash covers name, description, domain, parameters, `routingSummary`, `nearMisses`, and the global tail order. Tool count above 255 is invalid for the Jev architecture because Choice criteria are capped at 255. N = 100 is inside that cap.

**Date.** 2026-09-23

---

## D3. MVP metric is Execution Success Rate

**Decision.** Do not use an LLM judge.

For the single-step benchmark:

```text
execution_success =
  selected tool ∈ required_tools ∪ acceptable_tools
  AND required argument checks pass (when the task defines them)
  AND the tool returns a successful deterministic result
```

Report the aggregate as **Execution Success Rate**.

Reserve **End-to-End Task Success** for later experiments that add a deterministic expected outcome or a multi-step completion check. `R5 REASONING_FAILURE` does not fire until those outcomes exist.

Primary Recall@k uses `required_tools` only. A secondary lenient recall treats `acceptable_tools` as hits. Selection accuracy's denominator is attempts where a valid agent decision exists and the required tool was in the candidate set.

Absent `expected_arguments` means `R3` is not applicable for that task. It does not mean every argument list passes a hidden check, and it does not mean arguments are ignored when the task defines a subset match.

**Reason.** An LLM judge would add a second model to the outcome. The MVP question is whether the required tool was chosen and invoked correctly.

**Alternatives considered.**

* Grade the model's natural-language final answer with another model. Rejected for the MVP.
* Treat any tool call as success if the tool name matches, ignoring arguments. Rejected because argument failures are a distinct stage (`R3`).
* Fold `acceptable_tools` into primary Recall@k. Rejected because that inflates router quality on ambiguous tasks. Those tools still count for execution success.

**Consequences.** Figure 1 uses Execution Success Rate until end-to-end outcomes exist. Methodology and summary files must use that name and must not relabel it as Task Success Rate.

**Date.** 2026-09-23

---

## D4. Jev probabilities are stored independently

**Decision.** A Jev routing record keeps three fields, none computed from the others:

* `scores`: the full probability distribution over the presented tools
* `top1Probability`: the probability of the highest-ranked tool, copied from that distribution's winning entry as returned
* `confidence`: the provider-reported confidence value

Missing provider fields stay null. They are not backfilled.

**Reason.** Choice probabilities sum to 1. Provider confidence is a different number. Later calibration has to be able to test them separately. Deriving one from the other would make that test impossible.

**Alternatives considered.**

* Store only the top-k slice. Rejected because calibration and error analysis need the mass on tools that were cut.
* Treat confidence as max probability when the field is absent. Rejected because absence and a reported value are different observations.

**Consequences.** The `RouteDecision` type has all three fields. Mock providers used in tests must be able to set them to different numbers so a test can prove they are not aliased.

**Date.** 2026-09-23

---

## D5. `runs.jsonl` is the record. Memora mirrors it.

**Decision.** The result directory, especially `runs.jsonl`, is the source of truth for metrics, resume, and failure analysis. Memora is a best-effort observability mirror. The benchmark must finish and remain valid when Memora is disabled, unconfigured, or throwing.

The adapter uses `Memora.recordEvent` under the benchmark run id. It does not use `memora.tool()`, which would open a separate run per tool call. Adapter errors are logged and swallowed. Event payloads must not contain API keys.

**Reason.** Memora is instrumentation for the experiment, not a dependency of the measurement. A tracing outage must not become a fake model failure.

**Alternatives considered.**

* Fail the run when the trace write fails. Rejected because it mixes infrastructure with the scientific result. A trace-write failure may be logged as a warning on an otherwise valid run. It is not `R0` unless the model call itself failed.
* Keep a second local trace file as a competing source of truth. Rejected. The run record holds the trace. A debug sink may exist, but metrics read `runs.jsonl`.

**Consequences.** CI does not need Memora credentials. The smoke benchmark does not load the client.

**Date.** 2026-09-23

---

## D6. `R0 INFRASTRUCTURE_FAILURE` is outside the quality denominators

**Decision.** Add `R0 INFRASTRUCTURE_FAILURE`. Keep it distinct from `R1 ROUTING_FAILURE`.

`R0` means a valid decision was not obtained because of a provider, network, or API failure. A provider body that cannot be parsed into the required decision schema is also `R0`, with reason `malformed_decision`. Provider, network, timeout, and auth errors use reason `provider_error`. Summaries break `R0` down by reason.

`R1` means the router returned a schema-valid decision and the required tool is absent from the candidate set. An LLM router that returns unparseable output is `R0`, not `R1`, and must not fall back to the full toolspace.

Denominator rules for one attempt, defined as one `(task_id, repetition)`:

| Outcome | Routing metrics (Recall@k) | Execution Success Rate | How it is counted |
|---|---|---|---|
| Router call fails or is malformed (`R0`) | Excluded | Excluded | Infrastructure. Earliest stage wins. |
| Router decision is valid, agent call fails or is malformed (`R0`) | Included | Excluded | Routing can be scored. Execution cannot. Not `R2`. |
| Router and agent succeed, harness or tool throws before a `ToolExecutionResult` (`R0`) | Included | Excluded | Not `R4`. |
| Valid router decision, required tool missing (`R1`) | Included as a miss | Included as not successful | Scientific routing failure. |
| Valid path, wrong tool selected (`R2`), bad args (`R3`), or tool `success: false` (`R4`) | Included | Included as not successful | Scientific execution failure. |

`ToolExecutionResult.success = false` on a returned result is `R4`, not `R0`.

Aggregates:

```text
attempts
r0_attempts
infrastructure_failure_rate = r0_attempts / attempts

routing_scored = attempts with a valid router decision
recall@k = hits / routing_scored

execution_scored = attempts that are not execution-excluded R0
execution_success_rate = execution_successes / execution_scored
```

If a denominator is 0, the rate is null, not 0. `R0` is never folded into Execution Success Rate or Recall@k. An attempt is counted once. The earliest failing stage supplies the `R0` label.

**Reason.** A timeout is not evidence that Jev or the agent picked the wrong tool. Mixing them would move the quality numbers when the network is bad.

**Alternatives considered.**

* Count every non-success as a failure in one denominator. Rejected because infrastructure outages would look like routing misses.
* Retry silently until a valid decision appears. Rejected for the MVP. A retry would be a new attempt and would have to be recorded. The metric path does not hide `R0`.
* Give malformed model output its own failure code. Deferred. The reason field separates it inside `R0` until a later revision needs a new code.

**Consequences.** `summary.json` must show `attempts`, `r0_attempts`, `routing_scored`, and `execution_scored`. Methodology must repeat this table. Failure plots include `R0` as its own bar.

**Date.** 2026-09-23

---

## D7. Experimental neutrality

**Decision.** Do not tune prompts, `routingSummary` text, confidence thresholds, `nearMisses`, the global tool tail, or evaluation rules according to which setting makes Jev look better.

After the first benchmark result directory exists, any methodological change requires a new dataset version, registry hash, prompt version, or pricing version, plus an entry in this file. Old result directories are not rewritten.

**Reason.** The project characterizes behavior. A favorable number produced by an unversioned tweak is not a result.

**Alternatives considered.**

* Allow small prompt edits during the slice as "bugfixes" without a version bump. Rejected. Wording changes that can move Recall@k are methodological. Code defects that do not change the presented text or the scoring rule can be fixed without a data-version bump.

**Consequences.** Issue acceptance criteria do not include "improve Jev's score." The first real result directory is the line after which versions freeze.

**Date.** 2026-09-23

---

## D8. One TypeScript package and swappable interfaces

**Decision.** The harness is a single npm package: Node 20, TypeScript, Zod, Vitest. Interfaces are `Router`, `Agent`, `Tool`, `Evaluator`, `Tracer`, and `ResultStore`. Provider calls sit behind `ChatProvider` and `DecisionProvider`.

Jev is reached through the official TypeSafe System One API or OpenRouter (`typesafe/jev-1.13` or another pinned id). Third-party reseller hosts are out of scope.

The agent uses native tool calling. Baseline and routed runs share the agent prompt, model, and parameters. Default agent temperature is 0. Repetitions remain supported because temperature 0 is not a determinism guarantee. MVP concurrency is 1.

The first dataset path is `datasets/v0.1/tasks.jsonl`. `v1` is reserved for the later large set.

**Reason.** The repo was empty. The Memora SDK and the existing Memora incident harness are TypeScript. One package is enough until a second deployable exists. Native tool calling is the condition the research question describes.

**Alternatives considered.**

* Python, to match the TypeSafe Python examples. Rejected because Memora integration in this workspace is TypeScript and the repo had no Python runtime.
* A monorepo. Rejected until a second package needs its own release.
* A free-text "which tool?" prompt instead of native tool calling. Rejected because it would not measure tool selection under schema load.

**Consequences.** `package.json` is the runtime manifest. Python ports are not part of M0 or M1.

**Date.** 2026-09-23

---

## D9. Result directories are immutable and resumable

**Decision.** Each experiment writes a new directory:

```text
results/<timestamp>_<architecture>_n<N>_k<k>_<gitsha>/
  config.json
  runs.jsonl
  summary.json
  failures.jsonl
  checkpoint.json
```

`config.json` stores git SHA, dataset version, registry hash, architecture, router, model ids, parameters, N, k, repetitions, pricing version, and the config hash. Creating a directory that already exists fails. Resume is allowed only when the config hash matches. Resume skips completed `(repetition, task_id)` pairs. Pricing lives in `pricing/<version>.json`. Summaries store token counts plus `priced_cost_usd` and, when the provider sends it, `provider_reported_cost_usd`.

**Reason.** A later price change or code change must not rewrite a reported number. A crash at task 400 must not repeat the first 400.

**Alternatives considered.**

* Overwrite `results/latest`. Rejected.
* Store only USD and not tokens. Rejected because tokens are what make a price-table change recomputable.

**Consequences.** `results/` is gitignored when implementation starts. Result files are local artifacts, not source.

**Date.** 2026-09-23

---

## D10. M1 model pins

**Decision.** The vertical-slice configs use one shared agent and the official TypeSafe System One API for Jev.

* Agent: provider `openai`, model `gpt-5.6-sol`, temperature 0. The alias `gpt-5.6` is not a pin. OpenAI's model page on 2026-09-23 lists `gpt-5.6-sol` as the explicit id and does not list a dated snapshot.
* Jev: provider `typesafe`, model `jev-1.13.0`, via `POST https://api.typesafe.ai/v1/systemone`. `jev-latest` stays rejected. OpenRouter `typesafe/jev-1.13` is not the M1 path.

Both example configs use dataset `datasets/v0.1/tasks.jsonl`, toolspace 20, seed 0, and one repetition. Baseline has no router. Jev uses top-5.

**Reason.** The two architectures have to name the same agent or the comparison is not about routing. The TypeSafe client from #17 already speaks the official endpoint and the pinned id `jev-1.13.0`. OpenRouter would be a second host before any result exists. `gpt-5.6-sol` is the current flagship tool-calling model; it was not selected from a Jev score.

**Alternatives considered.**

* OpenRouter for Jev. Rejected for M1 because the landed client is the TypeSafe API. The same pinned model can move to OpenRouter later only with a new decision, before the first result directory.
* The alias `gpt-5.6`. Rejected because it routes to whatever OpenAI currently calls Sol.
* A cheaper agent tier. Rejected for the first slice. The question is what happens when a normal tool-calling agent sees the full toolspace. A cheaper model can be a later, versioned comparison.

**Consequences.** `configs/baseline-20.yaml` and `configs/jev-top5-20.yaml` carry these ids. `pricing/v1.json` freezes the 2026-09-23 provider prices for those ids. Unspecified agent parameters stay at the provider default until a config field records them.

**Date.** 2026-09-23

---

## D11. M2 LLM router pin

**Decision.** The LLM-router example config uses the same OpenAI model as the agent: provider `openai`, model `gpt-5.6-sol`, temperature 0 for the ranking call. `configs/llm-top5-20.yaml` matches the Jev config on agent, dataset, toolspace 20, top-5, seed 0, and one repetition. The router still ranks `routingSummary` only.

**Reason.** M2 compares routing methods. If the LLM router were a different, stronger or cheaper model, cost and quality differences would mix model choice with architecture. Using the same pinned id keeps the variable on the ranking path (structured Choice vs free-text ranking over the same summaries).

**Alternatives considered.**

* A cheaper OpenAI tier for the router only. Rejected for the first LLM-router comparison. It can be a later, versioned ablation.
* OpenRouter for the LLM router. Rejected while the agent already speaks the OpenAI Chat Completions API with `AGENT_API_KEY`.

**Consequences.** `pricing/v1.json` already prices `openai/gpt-5.6-sol`. Router and agent tokens both use that row. A different router model later needs a DECISIONS entry and, if new, a pricing row.

**Date.** 2026-09-23

---

## D12. M4 Jev k-sweep fixed N

**Decision.** ~~The M4 Jev top-k ablation holds toolspace size at **N = 25**~~  
**Superseded by D14.** Historical text retained for audit. Original choice was N = 25
with `topK ∈ {1, 3, 5, 10}` on `datasets/v0.2/tasks.jsonl`, matching M3 Jev pins (D10).

**Reason (historical).** k = 10 requires N ≥ 10; N = 25 was the smallest mid-range formal size.

**Date.** 2026-09-23

---

## D14. M4 fixed N amended to 100 (post-M3)

**Decision.** The M4 Jev top-k ablation holds toolspace size at **N = 100** and varies only
`topK ∈ {1, 3, 5, 10}`. All other scientific controls match frozen M3 Jev N=100 cells
(dataset v0.2 / 78 tasks, registry, distractors, routing summaries, Jev `jev-1.13.0`,
agent `gpt-5.6-sol` T=0, pricing `v1`, concurrency 1, seed 0, tracing noop, failure
taxonomy and denominators, `totalLatencyMs` rules).

**Execution policy.** M4 runs all four cells as a **fresh** ablation under
`results/_k-sweep/`. Immutable M3 `jev-top1-n100` / `jev-top5-n100` directories are **not**
reused or mixed into M4 manifests or aggregates (timestamp/environment consistency).

**Reason.** M3 paired scaling analysis showed N=100 simultaneously exhibits routing-coverage
pressure, downstream selection (R2) pressure, and large context/cost separation versus
baseline. N was predeclared from that analysis purpose — not by searching additional N
or retuning k.

**Alternatives considered.**

* N = 25 (D12). Superseded; insufficient cost/latency separation for the post-M3 question.
* N = 50. Cheaper but weaker latency/cost contrast in the M3 sample.
* Reusing M3 k=1/k=5 dirs analytically. Rejected for the live ablation to keep one
  execution timestamp/environment; M3 dirs remain immutable for M3 analysis only.

**Consequences.** Configs under `configs/k-sweep/` use N=100. Prior N=25 YAMLs archived at
`configs/archive/k-sweep-n25/`. No optimal-k claim from M4 unless a decision rule is
versioned before the run (tradeoff curve is the result).

---

## D15. Manifest-scoped analysis (fail-closed)

**Decision.** Offline analysis commands that aggregate result directories
(`summarize`, `k-sweep --summarize|--tradeoff|--marginal-utility`, and
`analysis:synthesis`) **require** an explicit epoch `--manifest` path under
`results/_matrix/`, `results/_k-sweep/`, or `results/_adaptive-eval/`. Bare
`--results <root>` scans are refused. Scaling table grouping keys include
`topK` so M3 Jev top-1 and top-5 cells at the same N remain distinct rows.

**Reason.** A post-M4 summarize against `results/` silently merged immutable M3
and M4 `jev_n100_k1` / `k5` directories (156 attempts). Fail-closed scoping prevents
that class of contamination.

**Alternatives considered.**

* Prefer-manifest-with-scan-fallback (adaptive-eval pattern). Rejected for
  summarize/k-sweep after the mixing incident.
* Soft warning only. Rejected — too easy to ignore in scripts.

**Consequences.** Publication synthesis is regenerated by
`npm run analysis:synthesis` from the three frozen manifests (M3/M4/adaptive).
JSON under `analysis/synthesis/` is canonical; SVG under `rendered/` is derived.

**Date.** 2026-09-24

---

## D13. Adaptive policy thresholds (M5 / #42)

**Decision.** Lock adaptive-routing thresholds at **`T_low = 0.5`**, **`T_high = 0.6`** in `policies/adaptive/v1.json`, selected by the pre-registered grid in [adaptive-policy.md](adaptive-policy.md) on the development split of `results/2026-09-24T040823Z_jev_n20_k5_2e9e789ecba3` (even FNV-1a `taskId` hash). Offline objective is routing-hit rate from stored Jev `scores` + `required_tools`; low-confidence escalate without paired LLM ranks is modeled as full toolspace coverage for selection only. `top1Probability` is never a branch input (D4).

**Reason.** `npm run check:calibration` reported usable calibration-bearing Jev dirs. Development high-confidence third hit rate (1.0) exceeded the low-confidence third (0.625) at probe k = 1, so the negative-result abort did not fire. Among grid pairs with perfect development hit rate, `(0.5, 0.6)` minimized mean candidate count (~3.35).

**Alternatives considered.**

* Leaving `v0.pending.json` forever. Rejected once live calibration existed; #43 needs concrete thresholds.
* Tuning on the full directory or the odd-hash holdout. Rejected (D7 / pre-registered split).
* Using observed ESR instead of routing-hit from scores. Rejected for threshold selection because stored attempts were all run at fixed k = 5; k = 1 / escalate ESR is not labeled offline.

**Consequences.** #43 may implement the adaptive `Router` against `policies/adaptive/v1.json`. Final adaptive evaluation dirs must be disjoint from the cited development directory. Changing thresholds requires a new policy version and a new DECISIONS entry.

**Date.** 2026-09-24

---

## D16. Publication checkpoint `ed3dd18`

**Decision.** Freeze **`ed3dd18`** as the analysis/publication checkpoint. Experimental
machinery (benchmark, live runs, k retunes, adaptive policy fitting) stays closed
unless a write-up exposes a separately preregistered follow-up. Publication claims
regenerate only via `npm run analysis:synthesis` from the three frozen manifests
(M3 / M4 / adaptive).

**Reason.** Manifest-scoped analysis (D15) and the synthesis SoT close the
reproducibility loop. Further experimental churn would reopen contamination and
decision-rule risks without answering a new predeclared question.

**Alternatives considered.**

* Continuing k or adaptive experiments “to strengthen the paper.” Rejected —
  evidence already supports the economics/failure-structure thesis with honest
  uncertainty (ΔESR CI crosses zero; 6-vs-5 discordance).
* Declaring top-5 equivalent to baseline. Rejected — paired CI and discordance
  forbid an equivalence claim.

**Consequences.** Next work is narrative. Docs cite `analysis/synthesis/`. No new
live runs on this checkpoint.

**Date.** 2026-09-24
