import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";
import { createEchoTool, listRowsTool, mutateByIdTool } from "./patterns.js";

const id = objectSchema({ id: stringParam("Event id.") }, ["id"]);

export const calendarTools = [
  defineTool(
    {
      name: "list_events",
      description: "List calendar events.",
      domain: "calendar",
      parameters: objectSchema({}, []),
      routingSummary: "List calendar events.",
      nearMisses: ["get_event", "find_availability", "list_calendars", "list_directory", "list_commits", "list_tasks"],
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
      nearMisses: ["list_events", "update_event", "delete_event", "get_issue", "get_task", "get_pull_request"],
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
      nearMisses: ["update_event", "find_availability", "create_task", "create_issue", "send_email"],
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
      nearMisses: ["check_conflicts", "list_events", "create_event", "get_event", "search_contacts"],
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
      nearMisses: ["get_event", "update_event", "list_events", "archive_email", "complete_task"],
    },
    (args, fixture) => {
      const event = rows(fixture, "events").find((row) => row.id === args.id);
      return event ? ok({ id: args.id, deleted: true }) : fail("event not found");
    },
  ),
  mutateByIdTool({
    name: "update_event",
    domain: "calendar",
    description: "Update the title of one calendar event.",
    routingSummary: "Update one calendar event's title.",
    nearMisses: ["get_event", "create_event", "delete_event", "update_task", "update_doc"],
    fixtureKey: "events",
    successField: "updated",
    notFound: "event not found",
    extraFields: { title: "New title." },
  }),
  mutateByIdTool({
    name: "invite_attendee",
    domain: "calendar",
    description: "Invite a person to one calendar event.",
    routingSummary: "Invite a person to a calendar event.",
    nearMisses: ["remove_attendee", "get_event", "invite_to_channel", "assign_task"],
    fixtureKey: "events",
    successField: "invited",
    notFound: "event not found",
    extraFields: { person: "Person to invite." },
  }),
  mutateByIdTool({
    name: "remove_attendee",
    domain: "calendar",
    description: "Remove a person from one calendar event.",
    routingSummary: "Remove a person from a calendar event.",
    nearMisses: ["invite_attendee", "get_event", "unshare_file", "assign_task"],
    fixtureKey: "events",
    successField: "removed",
    notFound: "event not found",
    extraFields: { person: "Person to remove." },
  }),
  listRowsTool({
    name: "list_calendars",
    domain: "calendar",
    description: "List available calendars.",
    routingSummary: "List available calendars.",
    nearMisses: ["create_calendar", "list_events", "list_channels", "list_projects"],
    fixtureKey: "calendars",
    resultKey: "calendars",
  }),
  createEchoTool({
    name: "create_calendar",
    domain: "calendar",
    description: "Create a named calendar.",
    routingSummary: "Create a named calendar.",
    nearMisses: ["list_calendars", "create_event", "create_channel", "create_project"],
    fields: { name: "Calendar name." },
    required: ["name"],
  }),
  mutateByIdTool({
    name: "check_conflicts",
    domain: "calendar",
    description: "Check whether one event conflicts with other events.",
    routingSummary: "Check conflicts for one calendar event.",
    nearMisses: ["find_availability", "get_event", "list_events", "get_task"],
    fixtureKey: "events",
    successField: "checked",
    notFound: "event not found",
  }),
  mutateByIdTool({
    name: "set_reminder",
    domain: "calendar",
    description: "Set a reminder on one calendar event.",
    routingSummary: "Set a reminder on a calendar event.",
    nearMisses: ["snooze_event", "get_event", "set_task_due_date", "pin_message"],
    fixtureKey: "events",
    successField: "reminded",
    notFound: "event not found",
    extraFields: { when: "Reminder time." },
  }),
  mutateByIdTool({
    name: "snooze_event",
    domain: "calendar",
    description: "Snooze the reminder for one calendar event.",
    routingSummary: "Snooze a calendar event reminder.",
    nearMisses: ["set_reminder", "get_event", "update_event"],
    fixtureKey: "events",
    successField: "snoozed",
    notFound: "event not found",
  }),
  createEchoTool({
    name: "export_calendar",
    domain: "calendar",
    description: "Export a calendar to a file path.",
    routingSummary: "Export a calendar to a file.",
    nearMisses: ["import_calendar", "list_calendars", "export_doc", "write_file"],
    fields: { name: "Calendar name.", path: "Destination path." },
    required: ["name", "path"],
  }),
  createEchoTool({
    name: "import_calendar",
    domain: "calendar",
    description: "Import a calendar from a file path.",
    routingSummary: "Import a calendar from a file.",
    nearMisses: ["export_calendar", "list_calendars", "read_file", "create_calendar"],
    fields: { path: "Source path.", name: "Calendar name." },
    required: ["path", "name"],
  }),
];
