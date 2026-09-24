import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures/catalog.js";
import { createToolRegistry } from "./registry/registry.js";
import { toolspaceForTask } from "./toolspace.js";
import { CATALOG_TAIL, catalogTools, createCatalogRegistry } from "./catalog.js";

/** Minimal valid args so every tool succeeds against the fixture. */
const calls: Record<string, Record<string, unknown>> = {
  search_files: { query: "quarterly" },
  read_file: { path: "finance/quarterly-report.pdf" },
  write_file: { path: "finance/notes.txt", content: "hello" },
  move_file: { from: "notes/todo.txt", to: "archive/todo.txt" },
  list_directory: { path: "finance" },
  search_file_content: { query: "revenue" },
  get_file_metadata: { path: "finance/quarterly-report.pdf" },
  copy_file: { from: "notes/todo.txt", to: "archive/todo.txt" },
  delete_file: { path: "notes/todo.txt" },
  create_directory: { path: "archive" },
  delete_directory: { path: "finance" },
  append_file: { path: "notes/todo.txt", content: " more" },
  share_file: { path: "notes/todo.txt", person: "Sarah" },
  unshare_file: { path: "notes/todo.txt", person: "Sarah" },
  list_shared_files: {},
  search_email: { query: "quarterly" },
  read_email: { id: "msg-1" },
  send_email: { to: "Sarah", subject: "Ack" },
  archive_email: { id: "msg-2" },
  download_attachment: { id: "msg-1" },
  reply_email: { id: "msg-1", body: "Thanks" },
  forward_email: { id: "msg-1", to: "Omar" },
  draft_email: { to: "Sarah", subject: "Draft", body: "..." },
  mark_email_read: { id: "msg-1" },
  mark_email_unread: { id: "msg-1" },
  star_email: { id: "msg-1" },
  move_email: { id: "msg-1", label: "finance" },
  search_attachments: { query: "quarterly" },
  list_labels: {},
  create_label: { name: "urgent" },
  list_events: {},
  get_event: { id: "evt-1" },
  create_event: { title: "Follow-up" },
  find_availability: { person: "Sarah" },
  delete_event: { id: "evt-1" },
  update_event: { id: "evt-1", title: "Budget sync" },
  invite_attendee: { id: "evt-1", person: "Omar" },
  remove_attendee: { id: "evt-1", person: "Sarah" },
  list_calendars: {},
  create_calendar: { name: "Travel" },
  check_conflicts: { id: "evt-1" },
  set_reminder: { id: "evt-1", when: "10m" },
  snooze_event: { id: "evt-1" },
  export_calendar: { name: "Work", path: "work.ics" },
  import_calendar: { path: "work.ics", name: "Imported" },
  search_code: { query: "exportReport" },
  get_issue: { number: 42 },
  create_issue: { title: "Missing total" },
  list_commits: { repo: "reports" },
  get_pull_request: { number: 7 },
  search_symbols: { query: "exportReport" },
  open_file_in_repo: { path: "src/export.ts" },
  blame_line: { path: "src/export.ts", line: "10" },
  create_pull_request: { title: "Fix export", branch: "feature/export" },
  merge_pull_request: { number: 7 },
  list_branches: { repo: "reports" },
  create_branch: { repo: "reports", name: "hotfix" },
  comment_on_issue: { number: "42", body: "Looking" },
  close_issue: { number: 42 },
  compare_commits: { repo: "reports", base: "abc123", head: "abc123" },
  search_messages: { query: "quarterly" },
  send_message: { channel: "general", text: "hello" },
  read_thread: { id: "thread-1" },
  list_channels: {},
  create_channel: { name: "ops" },
  invite_to_channel: { channel: "general", person: "Omar" },
  pin_message: { id: "chat-1" },
  react_to_message: { id: "chat-1", reaction: "thumbs_up" },
  upload_chat_file: { channel: "general", path: "notes/todo.txt" },
  search_people_chat: { query: "Sarah" },
  search_docs: { query: "Quarterly" },
  read_doc: { id: "doc-1" },
  create_doc: { title: "Notes", body: "draft" },
  update_doc: { id: "doc-1", body: "revised" },
  share_doc: { id: "doc-1", person: "Omar" },
  comment_on_doc: { id: "doc-1", body: "looks good" },
  list_doc_versions: { id: "doc-1" },
  restore_doc_version: { id: "doc-1", version: "v1" },
  export_doc: { id: "doc-1", path: "plan.md" },
  move_doc: { id: "doc-1", folder: "archive" },
  search_contacts: { query: "Sarah" },
  get_contact: { id: "ct-1" },
  create_contact: { name: "Ada", email: "ada@example.com" },
  update_contact: { id: "ct-1", email: "sarah@new.example" },
  search_companies: { query: "Acme" },
  get_company: { id: "co-1" },
  create_deal: { title: "New deal", company: "Acme" },
  get_deal: { id: "deal-1" },
  update_deal: { id: "deal-1", stage: "won" },
  log_call: { contact: "Sarah", notes: "Discussed renewal" },
  search_tasks: { query: "quarterly" },
  get_task: { id: "task-1" },
  create_task: { title: "Follow up", project: "Finance" },
  update_task: { id: "task-1", title: "Prepare slides" },
  complete_task: { id: "task-1" },
  assign_task: { id: "task-1", person: "Sarah" },
  list_projects: {},
  create_project: { name: "Ops" },
  add_task_comment: { id: "task-1", body: "Started" },
  set_task_due_date: { id: "task-1", due: "Friday" },
};

it("registers 100 tools across eight domains with a stable hash", () => {
  const registry = createCatalogRegistry();
  const tools = registry.list();
  expect(tools).toHaveLength(100);
  expect(CATALOG_TAIL).toHaveLength(100);
  expect(new Set(tools.map((tool) => tool.domain)).size).toBe(8);
  expect(registry.hash()).toMatch(/^[a-f0-9]{64}$/);
  expect(createCatalogRegistry().hash()).toBe(registry.hash());
  expect([...registry.tail]).toEqual([...CATALOG_TAIL]);
});

it("executes every tool once against the fixture", () => {
  const registry = createCatalogRegistry();
  expect(Object.keys(calls).sort()).toEqual(registry.list().map((tool) => tool.name).sort());
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

it("supports a nested toolspace of size 100 for a single required tool", () => {
  const registry = createCatalogRegistry();
  const space = toolspaceForTask(["search_email"], registry.list(), registry.tail, 100);
  expect(space).toHaveLength(100);
  expect(space?.[0]).toBe("search_email");
  expect(new Set(space).size).toBe(100);
});
