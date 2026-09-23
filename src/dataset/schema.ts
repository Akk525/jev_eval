import { readFileSync } from "node:fs";
import { z } from "zod";

export const difficulties = ["explicit", "implicit", "ambiguous", "multi_step"] as const;

export type Difficulty = (typeof difficulties)[number];

/** On-disk task row. Field names match the versioned JSONL schema. */
export interface BenchmarkTask {
  id: string;
  version: number;
  difficulty: Difficulty;
  prompt: string;
  required_tools: string[];
  acceptable_tools: string[];
  expected_sequence: string[];
  domains: string[];
  metadata: Record<string, unknown>;
  expected_arguments?: Record<string, unknown>;
}

const taskSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    difficulty: z.enum(difficulties),
    prompt: z.string().min(1),
    required_tools: z.array(z.string().min(1)).min(1),
    acceptable_tools: z.array(z.string().min(1)),
    expected_sequence: z.array(z.string().min(1)),
    domains: z.array(z.string().min(1)),
    metadata: z.record(z.unknown()),
    expected_arguments: z.record(z.unknown()).optional(),
  })
  .strict();

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetError";
  }
}

export function parseDataset(text: string): BenchmarkTask[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();

  const tasks: BenchmarkTask[] = [];
  const seen = new Map<string, number>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "") {
      throw new DatasetError(`line ${lineNumber}: empty line`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      throw new DatasetError(`line ${lineNumber}: invalid JSON`);
    }

    const parsed = taskSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".") || "(root)";
      throw new DatasetError(`line ${lineNumber}: ${field}: ${issue?.message ?? "invalid task"}`);
    }

    const firstLine = seen.get(parsed.data.id);
    if (firstLine !== undefined) {
      throw new DatasetError(
        `line ${lineNumber}: duplicate id ${parsed.data.id} (first seen at line ${firstLine})`,
      );
    }
    seen.set(parsed.data.id, lineNumber);
    tasks.push(parsed.data);
  });

  return tasks;
}

export function loadDataset(filePath: string): BenchmarkTask[] {
  return parseDataset(readFileSync(filePath, "utf8"));
}
