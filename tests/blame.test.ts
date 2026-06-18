import { describe, it, expect } from "vitest";
import { attachAuthors, parseBlamePorcelain } from "../src/diff/blame";
import type { FileDiff } from "../src/diff/types";

describe("parseBlamePorcelain", () => {
  it("maps each final line number to its commit author", () => {
    // Arrange — --line-porcelain repeats the full header block per line.
    const output = [
      "abc1234 1 1",
      "author Alice",
      "author-mail <alice@example.com>",
      "\tfirst line",
      "def5678 2 2",
      "author Bob",
      "author-mail <bob@example.com>",
      "\tsecond line",
    ].join("\n");

    // Act
    const byLine = parseBlamePorcelain(output);

    // Assert
    expect(byLine.get(1)).toBe("Alice");
    expect(byLine.get(2)).toBe("Bob");
    expect(byLine.size).toBe(2);
  });

  it("ignores author-mail and only captures the author name", () => {
    // Arrange — "author-mail" shares the "author" prefix but must not match.
    const output = ["abc1234 5 5", "author-mail <x@y.z>", "author Carol", "\tcontent"].join("\n");

    // Act
    const byLine = parseBlamePorcelain(output);

    // Assert
    expect(byLine.get(5)).toBe("Carol");
  });
});

describe("attachAuthors", () => {
  it("keys authors by the new-side line number and leaves pure deletions untouched", () => {
    // Arrange
    const diff: FileDiff = {
      oldPath: "note.md",
      newPath: "note.md",
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { kind: "add", text: "a", newLine: 1 },
            { kind: "add", text: "b", newLine: 2 },
            { kind: "del", text: "z", oldLine: 1 },
          ],
        },
      ],
    };
    const byLine = new Map([
      [1, "Alice"],
      [2, "Bob"],
    ]);

    // Act
    const result = attachAuthors(diff, byLine);
    const lines = result.hunks[0].lines;

    // Assert
    expect(lines[0].author).toBe("Alice");
    expect(lines[1].author).toBe("Bob");
    expect(lines[2].author).toBeUndefined();
  });

  it("does not mutate the input diff", () => {
    // Arrange
    const diff: FileDiff = {
      oldPath: "note.md",
      newPath: "note.md",
      hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "add", text: "a", newLine: 1 }] }],
    };
    const byLine = new Map([[1, "Alice"]]);

    // Act
    attachAuthors(diff, byLine);

    // Assert — the original line object still has no author.
    expect(diff.hunks[0].lines[0].author).toBeUndefined();
  });
});
