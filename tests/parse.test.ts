import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "../src/diff/parse";

describe("parseUnifiedDiff", () => {
  it("classifies context/add/del lines and assigns old/new line numbers", () => {
    // Arrange
    const unified = [
      "--- a/note.md",
      "+++ b/note.md",
      "@@ -1,3 +1,3 @@",
      " keep",
      "-old",
      "+new",
      " keep2",
    ].join("\n");

    // Act
    const diffs = parseUnifiedDiff(unified);

    // Assert
    expect(diffs).toHaveLength(1);
    expect(diffs[0].oldPath).toBe("note.md");
    expect(diffs[0].newPath).toBe("note.md");

    const lines = diffs[0].hunks[0].lines;
    expect(lines[0]).toMatchObject({ kind: "context", text: "keep", oldLine: 1, newLine: 1 });
    expect(lines[1]).toMatchObject({ kind: "del", text: "old", oldLine: 2 });
    expect(lines[2]).toMatchObject({ kind: "add", text: "new", newLine: 2 });
    expect(lines[3]).toMatchObject({ kind: "context", text: "keep2", oldLine: 3, newLine: 3 });
  });

  it("pairs adjacent del/add lines into character-level segments", () => {
    // Arrange
    const unified = ["--- a/note.md", "+++ b/note.md", "@@ -1,1 +1,1 @@", "-hello", "+help"].join("\n");

    // Act
    const lines = parseUnifiedDiff(unified)[0].hunks[0].lines;

    // Assert
    const del = lines[0];
    const add = lines[1];
    expect(del.kind).toBe("del");
    expect(add.kind).toBe("add");
    expect(del.segments).toBeDefined();
    expect(add.segments).toBeDefined();
    // The del side carries a removed run; the add side carries an added run.
    expect(del.segments!.some((s) => s.kind === "del")).toBe(true);
    expect(add.segments!.some((s) => s.kind === "add")).toBe(true);
  });

  it("leaves unpaired deletions and additions as standalone changed lines", () => {
    // Arrange: two deletions followed by one addition -> one pair, one leftover del.
    const unified = [
      "--- a/note.md",
      "+++ b/note.md",
      "@@ -1,4 +1,3 @@",
      " ctx",
      "-old1",
      "-old2",
      "+new1",
      " ctx2",
    ].join("\n");

    // Act
    const lines = parseUnifiedDiff(unified)[0].hunks[0].lines;

    // Assert: ctx, paired(old1/new1), leftover old2, ctx2
    expect(lines[0]).toMatchObject({ kind: "context", text: "ctx" });
    expect(lines[1]).toMatchObject({ kind: "del", text: "old1" });
    expect(lines[1].segments).toBeDefined();
    expect(lines[2]).toMatchObject({ kind: "add", text: "new1" });
    expect(lines[2].segments).toBeDefined();
    // The extra deletion is kept but has no segments (unpaired).
    expect(lines[3]).toMatchObject({ kind: "del", text: "old2" });
    expect(lines[3].segments).toBeUndefined();
    expect(lines[4]).toMatchObject({ kind: "context", text: "ctx2" });
  });

  it("ignores the '\\ No newline at end of file' marker", () => {
    // Arrange
    const unified = [
      "--- a/note.md",
      "+++ b/note.md",
      "@@ -1,1 +1,1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
    ].join("\n");

    // Act
    const lines = parseUnifiedDiff(unified)[0].hunks[0].lines;

    // Assert: only the del and add lines survive; the marker is dropped.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: "del", text: "old" });
    expect(lines[1]).toMatchObject({ kind: "add", text: "new" });
  });

  it("strips the a/ and b/ prefixes from file paths", () => {
    // Arrange
    const unified = ["--- a/deep/note.md", "+++ b/deep/note.md", "@@ -1,1 +1,1 @@", "-old", "+new"].join(
      "\n",
    );

    // Act
    const diff = parseUnifiedDiff(unified)[0];

    // Assert
    expect(diff.oldPath).toBe("deep/note.md");
    expect(diff.newPath).toBe("deep/note.md");
  });
});
