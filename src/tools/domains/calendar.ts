import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";

const id = objectSchema({ id: stringParam("Event id.") }, ["id"]);

export const calendarTools = [
  defineTool(
    {
      name: "list_events",
      description: "List calendar events.",
      domain: "calendar",
      parameters: objectSchema({}, []),
      routingSummary: "List calendar events.",
      nearMisses: ["get_event", "find_availability", "list_directory", "list_commits"],
    },
    (_args, fixture) => ok({ events: rows(fixture, "events") }),
  ),
  defineTool(
    {
      name: "get_event",
      description: "Get one calendar event by id.",
      domain: "calendar",
      parameters: id,
      routingSummary: "Get one calendar event by id.",
      nearMisses: ["list_events", "delete_event", "get_issue", "get_pull_request"],
    },
    (args, fixture) => {
      const event = rows(fixture, "events").find((row) => row.id === args.id);
      return event ? ok({ event }) : fail("event not found");
    },
  ),
  defineTool(
    {
      name: "create_event",
      description: "Create a calendar event with a title.",
      domain: "calendar",
      parameters: objectSchema({ title: stringParam("Event title.") }, ["title"]),
      routingSummary: "Create a calendar event.",
      nearMisses: ["list_events", "find_availability", "create_issue", "send_email"],
    },
    (args) => {
      if (text(args.title) === "") return fail("title is required");
      return ok({ title: args.title, created: true });
    },
  ),
  defineTool(
    {
      name: "find_availability",
      description: "Find open times for a person.",
      domain: "calendar",
      parameters: objectSchema({ person: stringParam("Person name.") }, ["person"]),
      routingSummary: "Find a person's open calendar times.",
      nearMisses: ["list_events", "create_event", "get_event"],
    },
    (args, fixture) => {
      const row = rows(fixture, "availability").find((entry) => entry.person === args.person);
      return row ? ok({ person: args.person, slots: row.slots }) : fail("person not found");
    },
  ),
  defineTool(
    {
      name: "delete_event",
      description: "Delete one calendar event by id.",
      domain: "calendar",
      parameters: id,
      routingSummary: "Delete one calendar event by id.",
      nearMisses: ["get_event", "list_events", "archive_email"],
    },
    (args, fixture) => {
      const event = rows(fixture, "events").find((row) => row.id === args.id);
      return event ? ok({ id: args.id, deleted: true }) : fail("event not found");
    },
  ),
];
