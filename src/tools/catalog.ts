import { calendarTools } from "./domains/calendar.js";
import { codeTools } from "./domains/code.js";
import { emailTools } from "./domains/email.js";
import { fileTools } from "./domains/files.js";
import { createToolRegistry, type ToolImplementation, type ToolRegistry } from "./registry/registry.js";

/** Domain-interleaved order. Near-miss lists, not this tail, supply the early distractors. */
export const CATALOG_TAIL = [
  "search_files",
  "search_email",
  "search_code",
  "list_events",
  "read_file",
  "read_email",
  "get_issue",
  "get_event",
  "write_file",
  "send_email",
  "create_issue",
  "create_event",
  "list_directory",
  "download_attachment",
  "list_commits",
  "find_availability",
  "move_file",
  "archive_email",
  "get_pull_request",
  "delete_event",
] as const;

export function catalogTools(): readonly ToolImplementation[] {
  return [...fileTools, ...emailTools, ...calendarTools, ...codeTools];
}

export function createCatalogRegistry(): ToolRegistry {
  const registry = createToolRegistry(CATALOG_TAIL);
  for (const tool of catalogTools()) registry.register(tool);
  return registry;
}
