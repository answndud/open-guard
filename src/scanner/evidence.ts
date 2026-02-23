import type { Evidence } from "./types.js";

const CONTEXT_LINES = 3;

export function extractEvidence(
  filePath: string,
  source: string,
  matchIndex: number,
  matchText: string,
): Evidence {
  const lines = source.split(/\r?\n/);
  const matchLine = indexToLine(lines, matchIndex);
  const contextStartLine = Math.max(1, matchLine - CONTEXT_LINES);
  const contextEndLine = Math.min(lines.length, matchLine + CONTEXT_LINES);
  const snippet = lines.slice(contextStartLine - 1, contextEndLine).join("\n");

  return {
    path: filePath,
    context_start_line: contextStartLine,
    context_end_line: contextEndLine,
    start_line: matchLine,
    end_line: matchLine,
    snippet,
    match: matchText,
  };
}

function indexToLine(lines: readonly string[], matchIndex: number): number {
  if (matchIndex <= 0) {
    return 1;
  }

  let remaining = matchIndex;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const length = line ? line.length : 0;
    if (remaining <= length) {
      return i + 1;
    }
    remaining -= length + 1;
  }

  return lines.length === 0 ? 1 : lines.length;
}
