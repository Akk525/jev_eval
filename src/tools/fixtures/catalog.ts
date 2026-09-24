import type { ToolFixture } from "../registry/registry.js";

/** Frozen records the mock tools read. Executors do not mutate this object. */
export const catalogFixture: ToolFixture = {
  files: [
    { path: "finance/quarterly-report.pdf", name: "quarterly-report.pdf", directory: "finance", content: "Q3 revenue" },
    { path: "notes/todo.txt", name: "todo.txt", directory: "notes", content: "buy milk" },
  ],
  sharedFiles: [{ path: "finance/quarterly-report.pdf", sharedWith: "Sarah" }],
  emails: [
    { id: "msg-1", from: "Sarah", subject: "quarterly report", body: "Attached.", attachment: "quarterly-report.pdf" },
    { id: "msg-2", from: "Omar", subject: "lunch", body: "Noon?", attachment: null },
  ],
  labels: [{ name: "finance" }, { name: "personal" }],
  events: [{ id: "evt-1", title: "Budget review", day: "Tuesday", attendees: ["Sarah"] }],
  availability: [{ person: "Sarah", slots: ["Tuesday 14:00"] }],
  calendars: [{ name: "Work" }, { name: "Personal" }],
  issues: [{ number: 42, title: "Fix report export", state: "open" }],
  pullRequests: [{ number: 7, title: "Add report parser", state: "open" }],
  commits: [{ repo: "reports", sha: "abc123", message: "Add quarterly export" }],
  code: [{ repo: "reports", path: "src/export.ts", snippet: "function exportReport" }],
  symbols: [{ name: "exportReport", path: "src/export.ts", kind: "function" }],
  branches: [
    { repo: "reports", name: "main" },
    { repo: "reports", name: "feature/export" },
  ],
  messages: [
    { id: "chat-1", channel: "general", from: "Sarah", text: "quarterly numbers ready" },
    { id: "chat-2", channel: "eng", from: "Omar", text: "shipped the parser" },
  ],
  threads: [{ id: "thread-1", channel: "general", topic: "quarterly" }],
  channels: [{ name: "general" }, { name: "eng" }],
  people: [
    { name: "Sarah", handle: "sarah" },
    { name: "Omar", handle: "omar" },
  ],
  docs: [{ id: "doc-1", title: "Quarterly plan", body: "Goals for Q3" }],
  docVersions: [
    { docId: "doc-1", version: "v1" },
    { docId: "doc-1", version: "v2" },
  ],
  contacts: [{ id: "ct-1", name: "Sarah", email: "sarah@example.com" }],
  companies: [{ id: "co-1", name: "Acme", domain: "acme.example" }],
  deals: [{ id: "deal-1", title: "Acme renewal", stage: "negotiation" }],
  tasks: [{ id: "task-1", title: "Prepare quarterly slides", project: "Finance" }],
  projects: [{ name: "Finance" }, { name: "Platform" }],
};
