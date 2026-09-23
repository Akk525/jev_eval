import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";

const id = objectSchema({ id: stringParam("Email id.") }, ["id"]);

export const emailTools = [
  defineTool(
    {
      name: "search_email",
      description: "Find emails whose sender or subject matches a text query.",
      domain: "email",
      parameters: objectSchema({ query: stringParam("Sender or subject fragment.") }, ["query"]),
      routingSummary: "Search emails by sender or subject.",
      nearMisses: ["read_email", "download_attachment", "search_files", "search_code"],
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
      nearMisses: ["search_email", "download_attachment", "read_file"],
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
      nearMisses: ["search_email", "read_email", "create_event", "create_issue"],
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
      nearMisses: ["search_email", "read_email", "delete_event"],
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
      nearMisses: ["read_email", "search_email", "read_file"],
    },
    (args, fixture) => {
      const email = rows(fixture, "emails").find((row) => row.id === args.id);
      if (!email) return fail("email not found");
      if (typeof email.attachment !== "string") return fail("email has no attachment");
      return ok({ id: args.id, filename: email.attachment });
    },
  ),
];
