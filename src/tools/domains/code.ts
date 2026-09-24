import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";
import { createEchoTool, getByIdTool, getByNumberTool, listRowsTool, searchRowsTool } from "./patterns.js";

const numberParam = { type: "number", description: "Numeric id." };

export const codeTools = [
  defineTool(
    {
      name: "search_code",
      description: "Search source code for a text snippet.",
      domain: "code",
      parameters: objectSchema({ query: stringParam("Code or path fragment.") }, ["query"]),
      routingSummary: "Search source code by snippet or path.",
      nearMisses: ["search_symbols", "get_issue", "list_commits", "search_files", "search_email", "search_docs"],
    },
    (args, fixture) => {
      const needle = text(args.query).toLowerCase();
      if (needle === "") return fail("query is required");
      const matches = rows(fixture, "code").filter((row) =>
        `${text(row.path)} ${text(row.snippet)}`.toLowerCase().includes(needle),
      );
      return ok({ matches });
    },
  ),
  defineTool(
    {
      name: "get_issue",
      description: "Get one issue by its number.",
      domain: "code",
      parameters: objectSchema({ number: numberParam }, ["number"]),
      routingSummary: "Get one issue by number.",
      nearMisses: ["create_issue", "comment_on_issue", "search_code", "get_pull_request", "get_task", "get_event"],
    },
    (args, fixture) => {
      const issue = rows(fixture, "issues").find((row) => row.number === args.number);
      return issue ? ok({ issue }) : fail("issue not found");
    },
  ),
  defineTool(
    {
      name: "create_issue",
      description: "Open a new issue with a title.",
      domain: "code",
      parameters: objectSchema({ title: stringParam("Issue title.") }, ["title"]),
      routingSummary: "Open a new issue.",
      nearMisses: ["get_issue", "close_issue", "create_task", "create_event", "send_email"],
    },
    (args) => {
      if (text(args.title) === "") return fail("title is required");
      return ok({ title: args.title, created: true });
    },
  ),
  defineTool(
    {
      name: "list_commits",
      description: "List commits in a repository.",
      domain: "code",
      parameters: objectSchema({ repo: stringParam("Repository name.") }, ["repo"]),
      routingSummary: "List commits in a repository.",
      nearMisses: ["compare_commits", "search_code", "get_pull_request", "list_events", "list_directory"],
    },
    (args, fixture) => {
      const commits = rows(fixture, "commits").filter((row) => row.repo === args.repo);
      if (commits.length === 0) return fail("repository not found");
      return ok({ commits });
    },
  ),
  defineTool(
    {
      name: "get_pull_request",
      description: "Get one pull request by its number.",
      domain: "code",
      parameters: objectSchema({ number: numberParam }, ["number"]),
      routingSummary: "Get one pull request by number.",
      nearMisses: ["create_pull_request", "merge_pull_request", "get_issue", "list_commits", "get_event"],
    },
    (args, fixture) => {
      const pullRequest = rows(fixture, "pullRequests").find((row) => row.number === args.number);
      return pullRequest ? ok({ pullRequest }) : fail("pull request not found");
    },
  ),
  searchRowsTool({
    name: "search_symbols",
    domain: "code",
    description: "Search code symbols such as functions and types.",
    routingSummary: "Search code symbols by name.",
    nearMisses: ["search_code", "open_file_in_repo", "get_issue", "search_files", "search_docs"],
    fixtureKey: "symbols",
    resultKey: "symbols",
    fields: ["name", "path", "kind"],
    queryDescription: "Symbol name fragment.",
  }),
  getByIdTool({
    name: "open_file_in_repo",
    domain: "code",
    description: "Open one repository file by path.",
    routingSummary: "Open one repository file by path.",
    nearMisses: ["search_code", "blame_line", "read_file", "read_doc"],
    fixtureKey: "code",
    resultKey: "file",
    idField: "path",
    idParam: "path",
    idDescription: "Repository file path.",
    notFound: "file not found",
  }),
  createEchoTool({
    name: "blame_line",
    domain: "code",
    description: "Show the commit that last changed a line in a file.",
    routingSummary: "Blame one line in a repository file.",
    nearMisses: ["open_file_in_repo", "list_commits", "search_code", "get_file_metadata"],
    fields: { path: "File path.", line: "Line number as text." },
    required: ["path", "line"],
  }),
  createEchoTool({
    name: "create_pull_request",
    domain: "code",
    description: "Open a pull request with a title.",
    routingSummary: "Open a new pull request.",
    nearMisses: ["get_pull_request", "merge_pull_request", "create_issue", "create_branch"],
    fields: { title: "Pull request title.", branch: "Source branch." },
    required: ["title", "branch"],
  }),
  getByNumberTool({
    name: "merge_pull_request",
    domain: "code",
    description: "Merge one pull request by number.",
    routingSummary: "Merge one pull request by number.",
    nearMisses: ["get_pull_request", "create_pull_request", "close_issue", "complete_task"],
    fixtureKey: "pullRequests",
    resultKey: "pullRequest",
    notFound: "pull request not found",
  }),
  listRowsTool({
    name: "list_branches",
    domain: "code",
    description: "List branches in a repository.",
    routingSummary: "List repository branches.",
    nearMisses: ["create_branch", "list_commits", "list_projects", "list_calendars"],
    fixtureKey: "branches",
    resultKey: "branches",
    filterField: "repo",
    filterParam: "repo",
    filterDescription: "Repository name.",
    emptyError: "repository not found",
  }),
  createEchoTool({
    name: "create_branch",
    domain: "code",
    description: "Create a branch in a repository.",
    routingSummary: "Create a repository branch.",
    nearMisses: ["list_branches", "create_pull_request", "create_project"],
    fields: { repo: "Repository name.", name: "Branch name." },
    required: ["repo", "name"],
  }),
  createEchoTool({
    name: "comment_on_issue",
    domain: "code",
    description: "Comment on one issue by number.",
    routingSummary: "Comment on an issue.",
    nearMisses: ["get_issue", "close_issue", "add_task_comment", "comment_on_doc", "send_message"],
    fields: { number: "Issue number as text.", body: "Comment body." },
    required: ["number", "body"],
  }),
  getByNumberTool({
    name: "close_issue",
    domain: "code",
    description: "Close one issue by number.",
    routingSummary: "Close one issue by number.",
    nearMisses: ["get_issue", "create_issue", "complete_task", "merge_pull_request"],
    fixtureKey: "issues",
    resultKey: "issue",
    notFound: "issue not found",
  }),
  createEchoTool({
    name: "compare_commits",
    domain: "code",
    description: "Compare two commits in a repository.",
    routingSummary: "Compare two commits.",
    nearMisses: ["list_commits", "search_code", "get_pull_request", "search_files"],
    fields: { repo: "Repository name.", base: "Base commit.", head: "Head commit." },
    required: ["repo", "base", "head"],
  }),
];
