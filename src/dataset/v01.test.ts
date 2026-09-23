import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createCatalogRegistry } from "../tools/catalog.js";
import { loadDataset } from "./schema.js";

const tasks = loadDataset(fileURLToPath(new URL("../../datasets/v0.1/tasks.jsonl", import.meta.url)));

it("loads 50 single-step tasks and resolves every tool name", () => {
  const names = new Set(createCatalogRegistry().list().map((tool) => tool.name));
  expect(tasks).toHaveLength(50);
  expect(new Set(tasks.map((task) => task.difficulty))).toEqual(new Set(["explicit", "implicit", "ambiguous"]));
  expect(tasks.some((task) => task.difficulty === "ambiguous" && task.acceptable_tools.length > 0)).toBe(true);

  for (const task of tasks) {
    expect(task.expected_sequence).toEqual(task.required_tools);
    expect(task.required_tools).toHaveLength(1);
    for (const name of [...task.required_tools, ...task.acceptable_tools]) {
      expect(names.has(name), `${task.id} ${name}`).toBe(true);
    }
  }
});
