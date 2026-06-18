import { parsePatch, type StructuredPatch, type StructuredPatchHunk } from "diff";
import { DiffHunk, DiffLine, FileDiff } from "./types";
import { granularSegments } from "./segments";

/**
 * Parse a unified `git diff` string into one `FileDiff` per changed file.
 * Each hunk's lines are classified add/del/context, then adjacent delete/add
 * runs are paired and refined into character-level segments.
 */
export function parseUnifiedDiff(unified: string): FileDiff[] {
  return parsePatch(unified).map(toFileDiff);
}

function toFileDiff(patch: StructuredPatch): FileDiff {
  return {
    oldPath: stripPrefix(patch.oldFileName),
    newPath: stripPrefix(patch.newFileName),
    hunks: patch.hunks.map(toHunk),
  };
}

function toHunk(h: StructuredPatchHunk): DiffHunk {
  let oldLine = h.oldStart;
  let newLine = h.newStart;
  const classified: DiffLine[] = [];

  for (const raw of h.lines) {
    const marker = raw[0];
    const text = raw.slice(1);
    // jsdiff emits a "\ No newline at end of file" marker line; ignore it.
    if (marker === "\\") continue;

    if (marker === "+") {
      classified.push({ kind: "add", text, newLine: newLine++ } satisfies DiffLine);
    } else if (marker === "-") {
      classified.push({ kind: "del", text, oldLine: oldLine++ } satisfies DiffLine);
    } else {
      classified.push({
        kind: "context",
        text,
        oldLine: oldLine++,
        newLine: newLine++,
      } satisfies DiffLine);
    }
  }

  return { oldStart: h.oldStart, newStart: h.newStart, lines: pairChanges(classified) };
}

/**
 * Pair each maximal run of consecutive deletions with the following run of
 * consecutive additions, refining matched del/add pairs into character
 * segments. Leftover deletions or additions (when the runs are uneven) are
 * kept as standalone changed lines. Returns new line objects (no mutation).
 */
function pairChanges(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind !== "del") {
      out.push(lines[i]);
      i++;
      continue;
    }

    let delEnd = i;
    while (delEnd < lines.length && lines[delEnd].kind === "del") delEnd++;
    let addEnd = delEnd;
    while (addEnd < lines.length && lines[addEnd].kind === "add") addEnd++;

    const dels = lines.slice(i, delEnd);
    const adds = lines.slice(delEnd, addEnd);
    const pairs = Math.min(dels.length, adds.length);

    for (let k = 0; k < pairs; k++) {
      const seg = granularSegments(dels[k].text, adds[k].text);
      out.push({ ...dels[k], segments: seg.del }, { ...adds[k], segments: seg.add });
    }
    for (let k = pairs; k < dels.length; k++) out.push(dels[k]);
    for (let k = pairs; k < adds.length; k++) out.push(adds[k]);

    i = addEnd;
  }

  return out;
}

function stripPrefix(name: string | undefined): string {
  if (!name) return "";
  return name.replace(/^[ab]\//, "");
}
