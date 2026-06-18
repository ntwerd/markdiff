import { parsePatch, diffChars } from "diff";
import { DiffHunk, DiffLine, FileDiff, TextSegment } from "./types";

/**
 * Stage 1: parse a unified `git diff` string into structured hunks.
 * Stage 2 computes character-level segments for paired del/add runs.
 */
export function parseUnifiedDiff(unified: string): FileDiff[] {
  const patches = parsePatch(unified);

  return patches.map((patch) => {
    const hunks: DiffHunk[] = patch.hunks.map((h) => {
      let oldLine = h.oldStart;
      let newLine = h.newStart;

      const lines: DiffLine[] = h.lines.map((raw) => {
        const marker = raw[0];
        const text = raw.slice(1);

        if (marker === "+") {
          return { kind: "add", text, newLine: newLine++ } satisfies DiffLine;
        }
        if (marker === "-") {
          return { kind: "del", text, oldLine: oldLine++ } satisfies DiffLine;
        }
        return {
          kind: "context",
          text,
          oldLine: oldLine++,
          newLine: newLine++,
        } satisfies DiffLine;
      });

      return { oldStart: h.oldStart, newStart: h.newStart, lines };
    });

    return {
      oldPath: stripPrefix(patch.oldFileName),
      newPath: stripPrefix(patch.newFileName),
      hunks: hunks.map(refineCharacters),
    };
  });
}

/**
 * Refine adjacent del/add runs in a hunk into character-level segments so a
 * typo fix highlights only the changed characters inside the rendered line.
 */
function refineCharacters(hunk: DiffHunk): DiffHunk {
  const out: DiffLine[] = [];
  const { lines } = hunk;

  for (let i = 0; i < lines.length; i++) {
    const del = lines[i];
    const add = lines[i + 1];

    if (del.kind === "del" && add?.kind === "add") {
      const changes = diffChars(del.text, add.text);
      del.segments = changes
        .filter((c) => !c.added)
        .map((c) => toSegment(c.removed ? "del" : "same", c.value));
      add.segments = changes
        .filter((c) => !c.removed)
        .map((c) => toSegment(c.added ? "add" : "same", c.value));
      out.push(del, add);
      i++; // consumed the paired add
      continue;
    }
    out.push(del);
  }

  return { ...hunk, lines: out };
}

function toSegment(kind: TextSegment["kind"], value: string): TextSegment {
  return { kind, value };
}

function stripPrefix(name: string | undefined): string {
  if (!name) return "";
  return name.replace(/^[ab]\//, "");
}
