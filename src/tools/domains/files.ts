import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";
import {
  createEchoTool,
  getByIdTool,
  listRowsTool,
  mutateByIdTool,
  searchRowsTool,
} from "./patterns.js";

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
      nearMisses: ["read_file", "list_directory", "search_file_content", "search_email", "search_code", "search_docs"],
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
      nearMisses: ["search_files", "list_directory", "get_file_metadata", "read_email", "read_doc"],
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
      nearMisses: ["append_file", "move_file", "read_file", "send_email", "create_doc"],
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
      nearMisses: ["copy_file", "write_file", "list_directory", "archive_email", "move_doc"],
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
      nearMisses: ["search_files", "read_file", "create_directory", "list_events", "list_commits"],
    },
    (args, fixture) => {
      const directory = text(args.path);
      if (directory === "") return fail("path is required");
      const files = rows(fixture, "files").filter((row) => row.directory === directory);
      return ok({ files });
    },
  ),
  searchRowsTool({
    name: "search_file_content",
    domain: "files",
    description: "Search inside file contents for a text fragment.",
    routingSummary: "Search the text inside stored files.",
    nearMisses: ["search_files", "read_file", "search_code", "search_docs", "search_email"],
    fixtureKey: "files",
    resultKey: "files",
    fields: ["content", "name", "path"],
    queryDescription: "Text found inside a file.",
  }),
  getByIdTool({
    name: "get_file_metadata",
    domain: "files",
    description: "Get metadata for one file by path.",
    routingSummary: "Get metadata for one file path.",
    nearMisses: ["read_file", "search_files", "list_directory", "get_contact"],
    fixtureKey: "files",
    resultKey: "file",
    idField: "path",
    idParam: "path",
    idDescription: "File path.",
    notFound: "file not found",
  }),
  createEchoTool({
    name: "copy_file",
    domain: "files",
    description: "Copy a file from one path to another.",
    routingSummary: "Copy a file to a new path.",
    nearMisses: ["move_file", "write_file", "read_file", "forward_email"],
    fields: { from: "Source path.", to: "Destination path." },
    required: ["from", "to"],
  }),
  mutateByIdTool({
    name: "delete_file",
    domain: "files",
    description: "Delete one file by path.",
    routingSummary: "Delete one file by path.",
    nearMisses: ["move_file", "read_file", "delete_directory", "delete_event", "archive_email"],
    fixtureKey: "files",
    idField: "path",
    idParam: "path",
    idDescription: "File path.",
    successField: "deleted",
    notFound: "file not found",
  }),
  createEchoTool({
    name: "create_directory",
    domain: "files",
    description: "Create an empty directory at a path.",
    routingSummary: "Create a directory at a path.",
    nearMisses: ["list_directory", "write_file", "delete_directory", "create_channel"],
    fields: { path: "Directory path." },
    required: ["path"],
  }),
  mutateByIdTool({
    name: "delete_directory",
    domain: "files",
    description: "Delete an empty directory by path.",
    routingSummary: "Delete a directory by path.",
    nearMisses: ["create_directory", "list_directory", "delete_file", "delete_event"],
    fixtureKey: "files",
    idField: "directory",
    idParam: "path",
    idDescription: "Directory path.",
    successField: "deleted",
    notFound: "directory not found",
  }),
  createEchoTool({
    name: "append_file",
    domain: "files",
    description: "Append text to an existing file.",
    routingSummary: "Append text onto an existing file.",
    nearMisses: ["write_file", "read_file", "update_doc", "send_message"],
    fields: { path: "File path.", content: "Text to append." },
    required: ["path", "content"],
  }),
  createEchoTool({
    name: "share_file",
    domain: "files",
    description: "Share a file with a person.",
    routingSummary: "Share a file with a person.",
    nearMisses: ["unshare_file", "read_file", "share_doc", "invite_to_channel"],
    fields: { path: "File path.", person: "Person to share with." },
    required: ["path", "person"],
  }),
  createEchoTool({
    name: "unshare_file",
    domain: "files",
    description: "Stop sharing a file with a person.",
    routingSummary: "Stop sharing a file with a person.",
    nearMisses: ["share_file", "read_file", "remove_attendee"],
    fields: { path: "File path.", person: "Person to remove." },
    required: ["path", "person"],
  }),
  listRowsTool({
    name: "list_shared_files",
    domain: "files",
    description: "List files shared with the current user.",
    routingSummary: "List files that are shared with you.",
    nearMisses: ["search_files", "list_directory", "share_file", "list_channels"],
    fixtureKey: "sharedFiles",
    resultKey: "files",
  }),
];
