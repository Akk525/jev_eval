import { expect, it } from "vitest";
import type { ToolDefinition } from "../types/tool.js";
import { createCatalogRegistry } from "./catalog.js";
import {
  SCALING_TOOLSPACE_SIZES,
  ToolspaceError,
  isScalingToolspaceSize,
  toolspaceForTask,
} from "./toolspace.js";

const tools: ToolDefinition[] = ["a", "b", "c", "d", "e"].map((name) => ({
  name,
  description: name,
  domain: "smoke",
  parameters: { type: "object" },
  routingSummary: name,
  nearMisses: name === "a" ? ["b", "c"] : [],
}));

it("nests per-task toolspaces and keeps the required tool first", () => {
  const tail = ["a", "b", "c", "d", "e"];
  const small = toolspaceForTask(["a"], tools, tail, 2);
  const full = toolspaceForTask(["a"], tools, tail, 5);
  expect(small).toEqual(["a", "b"]);
  expect(full).toEqual(["a", "b", "c", "d", "e"]);
  expect(full?.slice(0, small?.length)).toEqual(small);
});

it("returns null when the required tools do not fit", () => {
  expect(toolspaceForTask(["a", "b"], tools, [], 1)).toBeNull();
});

it("rejects non-positive or non-integer N", () => {
  expect(() => toolspaceForTask(["a"], tools, [], 0)).toThrow(ToolspaceError);
  expect(() => toolspaceForTask(["a"], tools, [], -1)).toThrow(/invalid toolspace size/);
  expect(() => toolspaceForTask(["a"], tools, [], 1.5)).toThrow(/invalid toolspace size/);
  expect(() => toolspaceForTask(["a"], tools, [], Number.NaN)).toThrow(ToolspaceError);
});

it("builds identical nested spaces at N=5,10,25,50,100 on the catalog", () => {
  const registry = createCatalogRegistry();
  const required = ["search_email"] as const;
  const spaces = SCALING_TOOLSPACE_SIZES.map((n) => {
    const first = toolspaceForTask(required, registry.list(), registry.tail, n);
    const second = toolspaceForTask(required, registry.list(), registry.tail, n);
    expect(first).toEqual(second);
    expect(first).toHaveLength(n);
    expect(first?.[0]).toBe("search_email");
    expect(new Set(first).size).toBe(n);
    return first!;
  });

  for (let index = 1; index < spaces.length; index += 1) {
    const smaller = spaces[index - 1]!;
    const larger = spaces[index]!;
    expect(larger.slice(0, smaller.length)).toEqual(smaller);
  }

  const nearMisses = registry.list().find((tool) => tool.name === "search_email")?.nearMisses ?? [];
  const early = spaces[0]!.slice(1);
  expect(early[0]).toBe(nearMisses[0]);
  expect(isScalingToolspaceSize(20)).toBe(false);
  expect(isScalingToolspaceSize(100)).toBe(true);
});

it("keeps every required tool present when the task is eligible", () => {
  const registry = createCatalogRegistry();
  const required = ["search_email", "search_files"] as const;
  const space = toolspaceForTask(required, registry.list(), registry.tail, 10);
  expect(space?.slice(0, 2)).toEqual([...required]);
  expect(space).toHaveLength(10);
  expect(toolspaceForTask(required, registry.list(), registry.tail, 1)).toBeNull();
});
