import { expect, it } from "vitest";
import { parseDataset } from "./schema.js";

function row(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "task_0001",
    version: 1,
    difficulty: "explicit",
    prompt: "Find emails from Sarah.",
    required_tools: ["search_email"],
    acceptable_tools: [],
    expected_sequence: ["search_email"],
    domains: ["email"],
    metadata: {},
    ...overrides,
  });
}

it("loads a valid dataset row", () => {
  const tasks = parseDataset(`${row()}\n`);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.required_tools).toEqual(["search_email"]);
});

it("rejects a duplicate id with the line number", () => {
  expect(() => parseDataset(`${row()}\n${row({ prompt: "Again." })}\n`)).toThrow(/line 2: duplicate id task_0001/);
});

it("rejects a missing required_tools field with the line number", () => {
  const raw = JSON.parse(row()) as Record<string, unknown>;
  delete raw.required_tools;
  expect(() => parseDataset(`${JSON.stringify(raw)}\n`)).toThrow(/line 1: required_tools/);
});

it("rejects an unknown difficulty with the line number", () => {
  expect(() => parseDataset(`${row({ difficulty: "easy" })}\n`)).toThrow(/line 1: difficulty/);
});

it("rejects unknown fields", () => {
  expect(() => parseDataset(`${row({ note: "extra" })}\n`)).toThrow(/line 1/);
});
