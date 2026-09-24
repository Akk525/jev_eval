import { calendarTools } from "./domains/calendar.js";
import { chatTools } from "./domains/chat.js";
import { codeTools } from "./domains/code.js";
import { crmTools } from "./domains/crm.js";
import { docsTools } from "./domains/docs.js";
import { emailTools } from "./domains/email.js";
import { fileTools } from "./domains/files.js";
import { taskTools } from "./domains/tasks.js";
import { createToolRegistry, type ToolImplementation, type ToolRegistry } from "./registry/registry.js";

/**
 * Domain-interleaved global tail for N=100.
 * Near-miss lists, not this tail, supply the early distractors.
 */
export const CATALOG_TAIL = [
  "search_files",
  "search_email",
  "list_events",
  "search_code",
  "search_messages",
  "search_docs",
  "search_contacts",
  "search_tasks",
  "read_file",
  "read_email",
  "get_event",
  "get_issue",
  "send_message",
  "read_doc",
  "get_contact",
  "get_task",
  "write_file",
  "send_email",
  "create_event",
  "create_issue",
  "read_thread",
  "create_doc",
  "create_contact",
  "create_task",
  "move_file",
  "archive_email",
  "find_availability",
  "list_commits",
  "list_channels",
  "update_doc",
  "update_contact",
  "update_task",
  "list_directory",
  "download_attachment",
  "delete_event",
  "get_pull_request",
  "create_channel",
  "share_doc",
  "search_companies",
  "complete_task",
  "search_file_content",
  "reply_email",
  "update_event",
  "search_symbols",
  "invite_to_channel",
  "comment_on_doc",
  "get_company",
  "assign_task",
  "get_file_metadata",
  "forward_email",
  "invite_attendee",
  "open_file_in_repo",
  "pin_message",
  "list_doc_versions",
  "create_deal",
  "list_projects",
  "copy_file",
  "draft_email",
  "remove_attendee",
  "blame_line",
  "react_to_message",
  "restore_doc_version",
  "get_deal",
  "create_project",
  "delete_file",
  "mark_email_read",
  "list_calendars",
  "create_pull_request",
  "upload_chat_file",
  "export_doc",
  "update_deal",
  "add_task_comment",
  "create_directory",
  "mark_email_unread",
  "create_calendar",
  "merge_pull_request",
  "search_people_chat",
  "move_doc",
  "log_call",
  "set_task_due_date",
  "delete_directory",
  "star_email",
  "check_conflicts",
  "list_branches",
  "append_file",
  "move_email",
  "set_reminder",
  "create_branch",
  "share_file",
  "search_attachments",
  "snooze_event",
  "comment_on_issue",
  "unshare_file",
  "list_labels",
  "export_calendar",
  "close_issue",
  "list_shared_files",
  "create_label",
  "import_calendar",
  "compare_commits",
] as const;

export function catalogTools(): readonly ToolImplementation[] {
  return [
    ...fileTools,
    ...emailTools,
    ...calendarTools,
    ...codeTools,
    ...chatTools,
    ...docsTools,
    ...crmTools,
    ...taskTools,
  ];
}

export function createCatalogRegistry(): ToolRegistry {
  const registry = createToolRegistry(CATALOG_TAIL);
  for (const tool of catalogTools()) registry.register(tool);
  return registry;
}
