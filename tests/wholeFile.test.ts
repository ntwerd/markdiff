import { describe, it, expect } from "vitest";
import { expandDiffToWholeFile } from "../src/diff/wholeFile";
import type { FileDiff } from "../src/diff/types";

describe("expandDiffToWholeFile", () => {
  it("fills unchanged context lines around the changed hunks", () => {
    // Arrange — working copy has 5 lines; the hunk only covers lines 2-4.
    const newFileText = "line1\nline2\nline3-new\nline4\nline5";
    const diff: FileDiff = {
      oldPath: "note.md",
      newPath: "note.md",
      hunks: [
        {
          oldStart: 2,
          newStart: 2,
          lines: [
            { kind: "context", text: "line2", oldLine: 2, newLine: 2 },
            { kind: "del", text: "line3-old", oldLine: 3 },
            { kind: "add", text: "line3-new", newLine: 3 },
            { kind: "context", text: "line4", oldLine: 4, newLine: 4 },
          ],
        },
      ],
    };

    // Act
    const expanded = expandDiffToWholeFile(diff, newFileText);

    // Assert — single hunk starting at new line 1, with leading and trailing
    // context pulled from the working copy around the change.
    expect(expanded.hunks).toHaveLength(1);
    expect(expanded.hunks[0].newStart).toBe(1);

    const lines = expanded.hunks[0].lines;
    expect(lines[0]).toMatchObject({ kind: "context", text: "line1", newLine: 1 });
    expect(lines[1]).toMatchObject({ kind: "context", text: "line2", newLine: 2 });
    expect(lines[2]).toMatchObject({ kind: "del", text: "line3-old" });
    expect(lines[3]).toMatchObject({ kind: "add", text: "line3-new", newLine: 3 });
    expect(lines[4]).toMatchObject({ kind: "context", text: "line4", newLine: 4 });
    expect(lines[5]).toMatchObject({ kind: "context", text: "line5", newLine: 5 });
  });

  it("anchors a pure-deletion hunk (no new-side line) at its newStart", () => {
    // Arrange — a hunk containing only a deletion has no newLine to anchor on.
    const newFileText = "a\nb\nc";
    const diff: FileDiff = {
      oldPath: "note.md",
      newPath: "note.md",
      hunks: [
        {
          oldStart: 2,
          newStart: 2,
          lines: [{ kind: "del", text: "b-old", oldLine: 2 }],
        },
      ],
    };

    // Act
    const expanded = expandDiffToWholeFile(diff, newFileText);

    // Assert — leading context before the deletion, deletion preserved, newStart 1.
    const lines = expanded.hunks[0].lines;
    expect(expanded.hunks[0].newStart).toBe(1);
    expect(lines[0]).toMatchObject({ kind: "context", text: "a", newLine: 1 });
    expect(lines[1]).toMatchObject({ kind: "del", text: "b-old" });
  });

  it("returns an empty hunk body for an empty working copy", () => {
    // Arrange
    const diff: FileDiff = {
      oldPath: "note.md",
      newPath: "note.md",
      hunks: [],
    };

    // Act
    const expanded = expandDiffToWholeFile(diff, "");

    // Assert
    expect(expanded.hunks).toHaveLength(1);
    expect(expanded.hunks[0].lines).toEqual([]);
  });
});
