# Dataset v0.1

`datasets/v0.1/tasks.jsonl` is the first labeled slice: 50 single-step tasks over the 20-tool catalog. It is not the later ~500-task set.

Labels were written from the tool descriptions and `src/tools/fixtures/catalog.ts`. They were not revised from model output.

## Required, acceptable, irrelevant

`required_tools` is the tool the label treats as necessary. In this slice that list has one name, and `expected_sequence` is that same name.

`acceptable_tools` are other tools that could reasonably satisfy the request. They count toward execution success and lenient recall. They do not count as primary Recall@k hits.

Every catalog tool that is in neither list is irrelevant for that task.

Ambiguous tasks have a non-empty `acceptable_tools` list. Explicit and implicit tasks leave it empty.

## Arguments

`expected_arguments` is present only when the prompt states a concrete value, such as an id, path, or title. The check is a subset match: extra arguments are allowed, and missing or different required values are `R3`.

If `expected_arguments` is absent, `R3` does not apply to that task.

## What this slice does not label

Multi-step sequences, end-to-end answers, and a second tool call. Those wait until single-step routing has been run.
