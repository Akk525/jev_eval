import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";
import { createEchoTool, getByIdTool, listRowsTool, mutateByIdTool, searchRowsTool } from "./patterns.js";

const id = objectSchema({ id: stringParam("Email id.") }, ["id"]);

export const emailTools = [
  defineTool(
    {
      name: "search_email",
      description: "Find emails whose sender or subject matches a text query.",
      domain: "email",
      parameters: objectSchema({ query: stringParam("Sender or subject fragment.") }, ["query"]),
      routingSummary: "Search emails by sender or subject.",
      nearMisses: ["read_email", "download_attachment", "search_attachments", "search_files", "search_code", "search_messages"],
    },
    (args, fixture) => {
      const needle = text(args.query).toLowerCase();
      if (needle === "") return fail("query is required");
      const matches = rows(fixture, "emails").filter((email) =>
        `${text(email.from)} ${text(email.subject)}`.toLowerCase().includes(needle),
      );
      return ok({ emails: matches });
    },
  ),
  defineTool(
    {
      name: "read_email",
      description: "Read one email by id, including its body.",
      domain: "email",
      parameters: id,
      routingSummary: "Read one email by id.",
      nearMisses: ["search_email", "download_attachment", "reply_email", "read_file", "read_thread"],
    },
    (args, fixture) => {
      const email = rows(fixture, "emails").find((row) => row.id === args.id);
      return email ? ok({ email }) : fail("email not found");
    },
  ),
  defineTool(
    {
      name: "send_email",
      description: "Send a new email to a recipient with a subject.",
      domain: "email",
      parameters: objectSchema(
        { to: stringParam("Recipient."), subject: stringParam("Subject line.") },
        ["to", "subject"],
      ),
      routingSummary: "Send a new email to a recipient.",
      nearMisses: ["draft_email", "reply_email", "forward_email", "send_message", "create_event"],
    },
    (args) => {
      if (text(args.to) === "" || text(args.subject) === "") return fail("to and subject are required");
      return ok({ to: args.to, subject: args.subject, sent: true });
    },
  ),
  defineTool(
    {
      name: "archive_email",
      description: "Archive one email so it leaves the inbox.",
      domain: "email",
      parameters: id,
      routingSummary: "Archive one email by id.",
      nearMisses: ["move_email", "search_email", "read_email", "delete_event", "complete_task"],
    },
    (args, fixture) => {
      const email = rows(fixture, "emails").find((row) => row.id === args.id);
      return email ? ok({ id: args.id, archived: true }) : fail("email not found");
    },
  ),
  defineTool(
    {
      name: "download_attachment",
      description: "Download the attachment from one email.",
      domain: "email",
      parameters: id,
      routingSummary: "Download an email attachment by email id.",
      nearMisses: ["read_email", "search_attachments", "search_email", "read_file", "upload_chat_file"],
    },
    (args, fixture) => {
      const email = rows(fixture, "emails").find((row) => row.id === args.id);
      if (!email) return fail("email not found");
      if (typeof email.attachment !== "string") return fail("email has no attachment");
      return ok({ id: args.id, filename: email.attachment });
    },
  ),
  mutateByIdTool({
    name: "reply_email",
    domain: "email",
    description: "Reply to one email with a body.",
    routingSummary: "Reply to one email by id.",
    nearMisses: ["forward_email", "send_email", "read_email", "send_message", "comment_on_doc"],
    fixtureKey: "emails",
    successField: "replied",
    notFound: "email not found",
    extraFields: { body: "Reply body." },
  }),
  mutateByIdTool({
    name: "forward_email",
    domain: "email",
    description: "Forward one email to a recipient.",
    routingSummary: "Forward one email to a recipient.",
    nearMisses: ["reply_email", "send_email", "read_email", "share_file", "share_doc"],
    fixtureKey: "emails",
    successField: "forwarded",
    notFound: "email not found",
    extraFields: { to: "Recipient." },
  }),
  createEchoTool({
    name: "draft_email",
    domain: "email",
    description: "Save an email draft without sending.",
    routingSummary: "Save an email draft.",
    nearMisses: ["send_email", "reply_email", "create_doc", "create_task"],
    fields: { to: "Recipient.", subject: "Subject line.", body: "Draft body." },
    required: ["to", "subject"],
  }),
  mutateByIdTool({
    name: "mark_email_read",
    domain: "email",
    description: "Mark one email as read.",
    routingSummary: "Mark one email as read.",
    nearMisses: ["mark_email_unread", "read_email", "star_email", "complete_task"],
    fixtureKey: "emails",
    successField: "read",
    notFound: "email not found",
  }),
  mutateByIdTool({
    name: "mark_email_unread",
    domain: "email",
    description: "Mark one email as unread.",
    routingSummary: "Mark one email as unread.",
    nearMisses: ["mark_email_read", "read_email", "star_email"],
    fixtureKey: "emails",
    successField: "unread",
    notFound: "email not found",
  }),
  mutateByIdTool({
    name: "star_email",
    domain: "email",
    description: "Star one email for later.",
    routingSummary: "Star one email by id.",
    nearMisses: ["mark_email_read", "archive_email", "pin_message", "complete_task"],
    fixtureKey: "emails",
    successField: "starred",
    notFound: "email not found",
  }),
  mutateByIdTool({
    name: "move_email",
    domain: "email",
    description: "Move one email into a label or folder.",
    routingSummary: "Move one email into a label.",
    nearMisses: ["archive_email", "create_label", "move_file", "move_doc"],
    fixtureKey: "emails",
    successField: "moved",
    notFound: "email not found",
    extraFields: { label: "Destination label." },
  }),
  searchRowsTool({
    name: "search_attachments",
    domain: "email",
    description: "Find emails that have an attachment matching a name fragment.",
    routingSummary: "Search email attachments by filename.",
    nearMisses: ["download_attachment", "search_email", "search_files", "search_docs"],
    fixtureKey: "emails",
    resultKey: "emails",
    fields: ["attachment", "subject"],
    queryDescription: "Attachment name fragment.",
  }),
  listRowsTool({
    name: "list_labels",
    domain: "email",
    description: "List email labels.",
    routingSummary: "List email labels.",
    nearMisses: ["create_label", "search_email", "list_channels", "list_projects"],
    fixtureKey: "labels",
    resultKey: "labels",
  }),
  createEchoTool({
    name: "create_label",
    domain: "email",
    description: "Create an email label.",
    routingSummary: "Create an email label.",
    nearMisses: ["list_labels", "move_email", "create_channel", "create_project"],
    fields: { name: "Label name." },
    required: ["name"],
  }),
];
