import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures/catalog.js";
import { createToolRegistry } from "./registry/registry.js";
import { CATALOG_TAIL, catalogTools, createCatalogRegistry } from "./catalog.js";

const calls: Record<string, Record<string, unknown>> = {
  search_files: { query: "quarterly" },
  read_file: { path: "finance/quarterly-report.pdf" },
  write_file: { path: "finance/notes.txt", content: "hello" },
  move_file: { from: "notes/todo.txt", to: "archive/todo.txt" },
  list_directory: { path: "finance" },
  search_email: { query: "quarterly" },
  read_email: { id: "msg-1" },
  send_email: { to: "Sarah", subject: "Ack" },
  archive_email: { id: "msg-2" },
  download_attachment: { id: "msg-1" },
  list_events: {},
  get_event: { id: "evt-1" },
  create_event: { title: "Follow-up" },
  find_availability: { person: "Sarah" },
  delete_event: { id: "evt-1" },
  search_code: { query: "exportReport" },
  get_issue: { number: 42 },
  create_issue: { title: "Missing total" },
  list_commits: { repo: "reports" },
  get_pull_request: { number: 7 },
};

it("registers 20 tools across four domains with a stable hash", () => {
  const registry = createCatalogRegistry();
  const tools = registry.list();
  expect(tools).toHaveLength(20);
  expect(new Set(tools.map((tool) => tool.domain)).size).toBeGreaterThanOrEqual(4);
  expect(registry.hash()).toMatch(/^[a-f0-9]{64}$/);
  expect(createCatalogRegistry().hash()).toBe(registry.hash());
  expect([...registry.tail]).toEqual([...CATALOG_TAIL]);
});

it("executes every tool once against the fixture", () => {
  const registry = createCatalogRegistry();
  for (const tool of registry.list()) {
    const args = calls[tool.name];
    expect(args, tool.name).toBeDefined();
    const first = registry.execute(tool.name, args, catalogFixture);
    const second = registry.execute(tool.name, args, catalogFixture);
    expect(first, tool.name).toEqual(second);
    expect(first.success, `${tool.name} ${first.error ?? ""}`).toBe(true);
  }
});

it("lists search_email and search_files as mutual near misses, same-domain first", () => {
  const byName = new Map(createCatalogRegistry().list().map((tool) => [tool.name, tool]));
  const files = byName.get("search_files");
  const email = byName.get("search_email");
  expect(files?.nearMisses).toContain("search_email");
  expect(email?.nearMisses).toContain("search_files");
  expect(files?.nearMisses.indexOf("read_file")).toBeLessThan(files?.nearMisses.indexOf("search_email") ?? -1);
  expect(email?.nearMisses.indexOf("read_email")).toBeLessThan(email?.nearMisses.indexOf("search_files") ?? -1);
});

it("changes the registry hash when a routing summary changes", () => {
  const before = createCatalogRegistry().hash();
  const registry = createToolRegistry(CATALOG_TAIL);
  for (const tool of catalogTools()) {
    if (tool.definition.name !== "search_email") {
      registry.register(tool);
      continue;
    }
    registry.register({
      ...tool,
      definition: { ...tool.definition, routingSummary: "A different frozen summary." },
    });
  }
  expect(registry.hash()).not.toBe(before);
});
