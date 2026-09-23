import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";

const query = objectSchema({ query: stringParam("File name or path fragment.") }, ["query"]);
const path = objectSchema({ path: stringParam("File or directory path.") }, ["path"]);

export const fileTools = [
  defineTool(
    {
      name: "search_files",
      description: "Find files whose name or path matches a text query.",
      domain: "files",
      parameters: query,
      routingSummary: "Search stored files by name or path.",
      nearMisses: ["read_file", "list_directory", "search_email", "search_code"],
    },
    (args, fixture) => {
      const needle = text(args.query).toLowerCase();
      if (needle === "") return fail("query is required");
      const matches = rows(fixture, "files").filter((file) =>
        `${text(file.name)} ${text(file.path)}`.toLowerCase().includes(needle),
      );
      return ok({ files: matches });
    },
  ),
  defineTool(
    {
      name: "read_file",
      description: "Read the contents of one file by its path.",
      domain: "files",
      parameters: path,
      routingSummary: "Read one file's contents from its path.",
      nearMisses: ["search_files", "list_directory", "read_email"],
    },
    (args, fixture) => {
      const file = rows(fixture, "files").find((row) => row.path === args.path);
      return file ? ok({ file }) : fail("file not found");
    },
  ),
  defineTool(
    {
      name: "write_file",
      description: "Write text content to a file path.",
      domain: "files",
      parameters: objectSchema(
        { path: stringParam("Destination path."), content: stringParam("Text to store.") },
        ["path", "content"],
      ),
      routingSummary: "Write text into a file path.",
      nearMisses: ["move_file", "read_file", "send_email"],
    },
    (args) => {
      if (text(args.path) === "" || typeof args.content !== "string") return fail("path and content are required");
      return ok({ path: args.path, content: args.content });
    },
  ),
  defineTool(
    {
      name: "move_file",
      description: "Move a file from one path to another.",
      domain: "files",
      parameters: objectSchema(
        { from: stringParam("Current path."), to: stringParam("New path.") },
        ["from", "to"],
      ),
      routingSummary: "Move a file from one path to another.",
      nearMisses: ["write_file", "list_directory", "archive_email"],
    },
    (args, fixture) => {
      const file = rows(fixture, "files").find((row) => row.path === args.from);
      if (!file) return fail("file not found");
      return ok({ from: args.from, to: args.to });
    },
  ),
  defineTool(
    {
      name: "list_directory",
      description: "List the files inside a directory.",
      domain: "files",
      parameters: path,
      routingSummary: "List files inside a directory.",
      nearMisses: ["search_files", "read_file", "list_events", "list_commits"],
    },
    (args, fixture) => {
      const directory = text(args.path);
      if (directory === "") return fail("path is required");
      const files = rows(fixture, "files").filter((row) => row.directory === directory);
      return ok({ files });
    },
  ),
];
