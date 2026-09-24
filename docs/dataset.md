# Dataset versions

## v0.1 — vertical slice

`datasets/v0.1/tasks.jsonl` is the first labeled slice: 50 single-step tasks over the original 20-tool vertical-slice set. M1/M2 example configs still point here.

Labels were written from the tool descriptions and `src/tools/fixtures/catalog.ts`. They were not revised from model output.

## v0.2 — scaling experiment

`datasets/v0.2/tasks.jsonl` is the M3 scaling set. It carries the audited v0.1 tasks (with `metadata.origin: v0.1`) and adds tasks for chat, docs, crm, tasks, plus a few expanded tools from the 100-tool registry. Every task is single-step, resolves against the current catalog, and has a reproducible nested distractor set at `N ∈ {5, 10, 25, 50, 100}`.

Prompts do not contain required tool ids and do not copy `routingSummary` verbatim. Labels were not taken from model scores (D7). Volume was not padded to a round number.

## Required, acceptable, irrelevant

`required_tools` is the tool the label treats as necessary. In these slices that list has one name, and `expected_sequence` is that same name.

`acceptable_tools` are other tools that could reasonably satisfy the request. They count toward execution success and lenient recall. They do not count as primary Recall@k hits.

Every catalog tool that is in neither list is irrelevant for that task.

Ambiguous tasks have a non-empty `acceptable_tools` list. Explicit and implicit tasks leave it empty.

## Arguments

`expected_arguments` is present only when the prompt states a concrete value, such as an id, path, or title. The check is a subset match: extra arguments are allowed, and missing or different required values are `R3`.

If `expected_arguments` is absent, `R3` does not apply to that task.

## What these slices do not label

Multi-step sequences, end-to-end answers, and a second tool call. Those wait until single-step routing has been run.
