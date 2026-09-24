import type { JsonSchema } from "../../types/json-schema.js";
import type { ToolImplementation } from "../registry/registry.js";
import { defineTool, fail, objectSchema, ok, rows, stringParam, text } from "./define.js";

/** Search fixture rows by one or more string fields. */
export function searchRowsTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fixtureKey: string;
  resultKey: string;
  fields: readonly string[];
  queryDescription: string;
}): ToolImplementation {
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters: objectSchema({ query: stringParam(options.queryDescription) }, ["query"]),
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args, fixture) => {
      const needle = text(args.query).toLowerCase();
      if (needle === "") return fail("query is required");
      const matches = rows(fixture, options.fixtureKey).filter((row) =>
        options.fields.some((field) => text(row[field]).toLowerCase().includes(needle)),
      );
      return ok({ [options.resultKey]: matches });
    },
  );
}

/** Fetch one fixture row by a string id field. */
export function getByIdTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fixtureKey: string;
  resultKey: string;
  idField?: string;
  idParam?: string;
  idDescription?: string;
  notFound?: string;
}): ToolImplementation {
  const idField = options.idField ?? "id";
  const idParam = options.idParam ?? "id";
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters: objectSchema({ [idParam]: stringParam(options.idDescription ?? "Record id.") }, [idParam]),
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args, fixture) => {
      const row = rows(fixture, options.fixtureKey).find((entry) => entry[idField] === args[idParam]);
      return row ? ok({ [options.resultKey]: row }) : fail(options.notFound ?? "not found");
    },
  );
}

/** Fetch one fixture row by a numeric id field. */
export function getByNumberTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fixtureKey: string;
  resultKey: string;
  numberParam?: string;
  notFound?: string;
}): ToolImplementation {
  const numberParam = options.numberParam ?? "number";
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters: objectSchema({ [numberParam]: { type: "number", description: "Numeric id." } }, [numberParam]),
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args, fixture) => {
      const row = rows(fixture, options.fixtureKey).find((entry) => entry[numberParam] === args[numberParam]);
      return row ? ok({ [options.resultKey]: row }) : fail(options.notFound ?? "not found");
    },
  );
}

/** Create-style tool that echoes required string args. */
export function createEchoTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fields: Readonly<Record<string, string>>;
  required: readonly string[];
}): ToolImplementation {
  const properties: Record<string, JsonSchema> = {};
  for (const [key, description] of Object.entries(options.fields)) {
    properties[key] = stringParam(description);
  }
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters: objectSchema(properties, options.required),
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args) => {
      for (const key of options.required) {
        if (text(args[key]) === "") return fail(`${key} is required`);
      }
      const data: Record<string, unknown> = { created: true };
      for (const key of Object.keys(options.fields)) data[key] = args[key];
      return ok(data);
    },
  );
}

/** Mutate-by-id: require the row exists, then echo success. */
export function mutateByIdTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fixtureKey: string;
  idField?: string;
  idParam?: string;
  idDescription?: string;
  successField: string;
  notFound?: string;
  extraFields?: Readonly<Record<string, string>>;
}): ToolImplementation {
  const idField = options.idField ?? "id";
  const idParam = options.idParam ?? "id";
  const properties: Record<string, JsonSchema> = {
    [idParam]: stringParam(options.idDescription ?? "Record id."),
  };
  const required = [idParam];
  for (const [key, description] of Object.entries(options.extraFields ?? {})) {
    properties[key] = stringParam(description);
    required.push(key);
  }
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters: objectSchema(properties, required),
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args, fixture) => {
      const row = rows(fixture, options.fixtureKey).find((entry) => entry[idField] === args[idParam]);
      if (!row) return fail(options.notFound ?? "not found");
      for (const key of Object.keys(options.extraFields ?? {})) {
        if (text(args[key]) === "") return fail(`${key} is required`);
      }
      const data: Record<string, unknown> = { [idParam]: args[idParam], [options.successField]: true };
      for (const key of Object.keys(options.extraFields ?? {})) data[key] = args[key];
      return ok(data);
    },
  );
}

/** List all rows for a fixture key, optionally filtered by a string field. */
export function listRowsTool(options: {
  name: string;
  domain: string;
  description: string;
  routingSummary: string;
  nearMisses: readonly string[];
  fixtureKey: string;
  resultKey: string;
  filterField?: string;
  filterParam?: string;
  filterDescription?: string;
  emptyError?: string;
}): ToolImplementation {
  const filterParam = options.filterParam;
  const parameters =
    filterParam === undefined
      ? objectSchema({}, [])
      : objectSchema({ [filterParam]: stringParam(options.filterDescription ?? "Filter value.") }, [filterParam]);
  return defineTool(
    {
      name: options.name,
      description: options.description,
      domain: options.domain,
      parameters,
      routingSummary: options.routingSummary,
      nearMisses: [...options.nearMisses],
    },
    (args, fixture) => {
      let matches = rows(fixture, options.fixtureKey);
      if (filterParam !== undefined && options.filterField !== undefined) {
        const value = text(args[filterParam]);
        if (value === "") return fail(`${filterParam} is required`);
        matches = matches.filter((row) => row[options.filterField!] === value);
        if (matches.length === 0) return fail(options.emptyError ?? "not found");
      }
      return ok({ [options.resultKey]: matches });
    },
  );
}
