import type { ToolFixture } from "../registry/registry.js";

/** Frozen records the mock tools read. Executors do not mutate this object. */
export const catalogFixture: ToolFixture = {
  files: [
    { path: "finance/quarterly-report.pdf", name: "quarterly-report.pdf", directory: "finance", content: "Q3 revenue" },
    { path: "notes/todo.txt", name: "todo.txt", directory: "notes", content: "buy milk" },
  ],
  emails: [
    { id: "msg-1", from: "Sarah", subject: "quarterly report", body: "Attached.", attachment: "quarterly-report.pdf" },
    { id: "msg-2", from: "Omar", subject: "lunch", body: "Noon?", attachment: null },
  ],
  events: [{ id: "evt-1", title: "Budget review", day: "Tuesday", attendees: ["Sarah"] }],
  availability: [{ person: "Sarah", slots: ["Tuesday 14:00"] }],
  issues: [{ number: 42, title: "Fix report export", state: "open" }],
  pullRequests: [{ number: 7, title: "Add report parser", state: "open" }],
  commits: [{ repo: "reports", sha: "abc123", message: "Add quarterly export" }],
  code: [{ repo: "reports", path: "src/export.ts", snippet: "function exportReport" }],
};
