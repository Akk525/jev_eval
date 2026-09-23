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
