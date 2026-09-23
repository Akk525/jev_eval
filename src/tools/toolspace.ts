import type { ToolDefinition } from "../types/tool.js";

/**
 * required tools, then a frozen distractor prefix, truncated to N.
 * Returns null when the required set cannot fit in N. That task is not run.
 */
export function toolspaceForTask(
  requiredTools: readonly string[],
  tools: readonly ToolDefinition[],
  tail: readonly string[],
  n: number,
): readonly string[] | null {
  if (requiredTools.length > n) return null;
  const known = new Set(tools.map((tool) => tool.name));
  for (const name of requiredTools) {
    if (!known.has(name)) throw new Error(`required tool is not in the registry: ${name}`);
  }
  const distractors = distractorSequence(requiredTools, tools, tail);
  return [...requiredTools, ...distractors.slice(0, n - requiredTools.length)];
}

function distractorSequence(
  required: readonly string[],
  tools: readonly ToolDefinition[],
  tail: readonly string[],
): string[] {
  const known = new Set(tools.map((tool) => tool.name));
  const nearMisses = new Map(tools.map((tool) => [tool.name, tool.nearMisses]));
  const emitted = new Set(required);
  const ordered: string[] = [];
  const cursors = required.map(() => 0);

  let progressed = true;
  while (progressed) {
    progressed = false;
    const round: string[] = [];
    required.forEach((tool, index) => {
      const list = nearMisses.get(tool) ?? [];
      let cursor = cursors[index] ?? 0;
      while (cursor < list.length) {
        const candidate = list[cursor] ?? "";
        if (known.has(candidate) && !emitted.has(candidate)) break;
        cursor += 1;
      }
      const next = list[cursor];
      cursors[index] = next === undefined ? cursor : cursor + 1;
      if (next !== undefined && known.has(next) && !emitted.has(next) && !round.includes(next)) {
        round.push(next);
      }
    });
    round.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    for (const name of round) {
      if (emitted.has(name)) continue;
      emitted.add(name);
      ordered.push(name);
      progressed = true;
    }
  }

  for (const name of [...tail, ...tools.map((tool) => tool.name)]) {
    if (!known.has(name) || emitted.has(name)) continue;
    emitted.add(name);
    ordered.push(name);
  }
  return ordered;
}
