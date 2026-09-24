import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createCatalogRegistry } from "../tools/catalog.js";
import { SCALING_TOOLSPACE_SIZES, toolspaceForTask } from "../tools/toolspace.js";
import { loadDataset } from "./schema.js";

const tasks = loadDataset(fileURLToPath(new URL("../../datasets/v0.2/tasks.jsonl", import.meta.url)));

it("loads the scaling dataset and resolves every tool against the registry", () => {
  const registry = createCatalogRegistry();
  const names = new Set(registry.list().map((tool) => tool.name));
  const summaries = new Map(registry.list().map((tool) => [tool.name, tool.routingSummary]));

  expect(tasks.length).toBeGreaterThanOrEqual(50);
  expect(new Set(tasks.map((task) => task.difficulty))).toEqual(new Set(["explicit", "implicit", "ambiguous"]));
  expect(tasks.some((task) => task.difficulty === "ambiguous" && task.acceptable_tools.length > 0)).toBe(true);
  expect(tasks.some((task) => task.domains.includes("chat"))).toBe(true);
  expect(tasks.some((task) => task.domains.includes("docs"))).toBe(true);
  expect(tasks.some((task) => task.domains.includes("crm"))).toBe(true);
  expect(tasks.some((task) => task.domains.includes("tasks"))).toBe(true);

  for (const task of tasks) {
    expect(task.version).toBe(2);
    expect(task.expected_sequence).toEqual(task.required_tools);
    expect(task.required_tools).toHaveLength(1);
    for (const name of [...task.required_tools, ...task.acceptable_tools]) {
      expect(names.has(name), `${task.id} ${name}`).toBe(true);
    }
    for (const name of task.required_tools) {
      expect(task.prompt.includes(name), `${task.id} leaks tool id ${name}`).toBe(false);
      const summary = summaries.get(name) ?? "";
      expect(task.prompt === summary, `${task.id} copies routingSummary`).toBe(false);
    }
  }
});

it("builds nested distractor sets at every scaling N for each difficulty band", () => {
  const registry = createCatalogRegistry();
  const byDifficulty = {
    explicit: tasks.find((task) => task.difficulty === "explicit")!,
    implicit: tasks.find((task) => task.difficulty === "implicit")!,
    ambiguous: tasks.find((task) => task.difficulty === "ambiguous")!,
  };

  for (const [band, task] of Object.entries(byDifficulty)) {
    const spaces = SCALING_TOOLSPACE_SIZES.map((n) => {
      const space = toolspaceForTask(task.required_tools, registry.list(), registry.tail, n);
      expect(space, `${band} ${task.id} N=${n}`).not.toBeNull();
      expect(space).toHaveLength(n);
      expect(space?.slice(0, task.required_tools.length)).toEqual(task.required_tools);
      expect(toolspaceForTask(task.required_tools, registry.list(), registry.tail, n)).toEqual(space);
      return space!;
    });
    for (let index = 1; index < spaces.length; index += 1) {
      expect(spaces[index]!.slice(0, spaces[index - 1]!.length)).toEqual(spaces[index - 1]);
    }
  }
});
