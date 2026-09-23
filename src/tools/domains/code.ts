import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";

const numberParam = { type: "number", description: "Numeric id." };

export const codeTools = [
  defineTool(
    {
      name: "search_code",
      description: "Search source code for a text snippet.",
      domain: "code",
      parameters: objectSchema({ query: stringParam("Code or path fragment.") }, ["query"]),
      routingSummary: "Search source code by snippet or path.",
      nearMisses: ["get_issue", "list_commits", "search_files", "search_email"],
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
      nearMisses: ["create_issue", "search_code", "get_pull_request", "get_event"],
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
      nearMisses: ["get_issue", "search_code", "create_event", "send_email"],
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
      nearMisses: ["search_code", "get_pull_request", "list_events", "list_directory"],
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
      nearMisses: ["get_issue", "list_commits", "search_code", "get_event"],
    },
    (args, fixture) => {
      const pullRequest = rows(fixture, "pullRequests").find((row) => row.number === args.number);
      return pullRequest ? ok({ pullRequest }) : fail("pull request not found");
    },
  ),
];
