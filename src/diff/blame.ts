import { FileDiff } from "./types";

const HEADER = /^[0-9a-f]{7,40} \d+ (\d+)(?: \d+)?$/;
const AUTHOR_FIELD = "author ";

/**
 * Parse `git blame --line-porcelain` output into a map of 1-based final line
 * number → author name. In `--line-porcelain` every line repeats the full
 * commit header block, so the author is re-read for each blamed line.
 */
export function parseBlamePorcelain(output: string): Map<number, string> {
  const byLine = new Map<number, string>();
  let finalLine = 0;
  let author = "";

  for (const line of output.split("\n")) {
    const header = HEADER.exec(line);
    if (header) {
      finalLine = Number.parseInt(header[1], 10);
      continue;
    }
    if (line.startsWith(AUTHOR_FIELD)) {
      author = line.slice(AUTHOR_FIELD.length);
      continue;
    }
    // The content line is prefixed with a tab and terminates the line's block.
    if (line.startsWith("\t") && finalLine > 0 && author) {
      byLine.set(finalLine, author);
    }
  }

  return byLine;
}

/**
 * Return a copy of `diff` with each line's `author` populated from the blame
 * map, keyed by the line's new-side line number. Lines without a new-side
 * number (pure deletions) are left untouched.
 */
export function attachAuthors(diff: FileDiff, byLine: Map<number, string>): FileDiff {
  return {
    ...diff,
    hunks: diff.hunks.map((hunk) => ({
      ...hunk,
      lines: hunk.lines.map((line) =>
        line.newLine !== undefined && byLine.has(line.newLine)
          ? { ...line, author: byLine.get(line.newLine) }
          : line,
      ),
    })),
  };
}
