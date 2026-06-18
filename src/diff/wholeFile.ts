import { DiffHunk, DiffLine, FileDiff } from "./types";

/**
 * Expand a normal unified diff so the renderer sees every line from the
 * working copy, not just git's changed hunks and nearby context.
 */
export function expandDiffToWholeFile(diff: FileDiff, newFileText: string): FileDiff {
  const newLines = splitFileLines(newFileText);
  const lines: DiffLine[] = [];
  let nextNewLine = 1;

  for (const hunk of diff.hunks) {
    const firstNew = firstNewLine(hunk);
    // anchor is the first position in the new file occupied by the hunk.
    // For mixed hunks this is the first line with a newLine (context or add).
    // For pure-deletion hunks it is newStart (the position where the deleted
    // lines sit in the new file's numbering).
    const anchor = firstNew ?? Math.max(1, hunk.newStart);

    while (nextNewLine < anchor && nextNewLine <= newLines.length) {
      lines.push(contextLine(newLines[nextNewLine - 1], nextNewLine));
      nextNewLine++;
    }

    for (const line of hunk.lines) {
      lines.push(line);
      if (line.newLine !== undefined) {
        nextNewLine = Math.max(nextNewLine, line.newLine + 1);
      }
    }
  }

  while (nextNewLine <= newLines.length) {
    lines.push(contextLine(newLines[nextNewLine - 1], nextNewLine));
    nextNewLine++;
  }

  return {
    ...diff,
    hunks: [
      {
        oldStart: diff.hunks[0]?.oldStart ?? 1,
        newStart: 1,
        lines,
      },
    ],
  };
}

function firstNewLine(hunk: DiffHunk): number | undefined {
  return hunk.lines.find((line) => line.newLine !== undefined)?.newLine;
}

function contextLine(text: string, lineNumber: number): DiffLine {
  return {
    kind: "context",
    text,
    newLine: lineNumber,
  };
}

function splitFileLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
