import { expect, it } from "vitest";
import type { ToolDefinition } from "../types/tool.js";
import { toolspaceForTask } from "./toolspace.js";

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
