import { describe, it, expect } from "vitest";
import { granularSegments, splitCommon } from "../src/diff/segments";

describe("granularSegments", () => {
  it("preserves matching runs as same segments and splits changed characters", () => {
    // Arrange
    const oldText = "hello world";
    const newText = "hello earth";

    // Act
    const { del, add } = granularSegments(oldText, newText);

    // Assert: each side reconstructs its source text exactly.
    expect(del.map((s) => s.value).join("")).toBe(oldText);
    expect(add.map((s) => s.value).join("")).toBe(newText);
    // The del side never carries an "add" run and vice versa.
    expect(del.some((s) => s.kind === "add")).toBe(false);
    expect(add.some((s) => s.kind === "del")).toBe(false);
    expect(del.some((s) => s.kind === "del")).toBe(true);
    expect(add.some((s) => s.kind === "add")).toBe(true);
  });

  it("marks identical strings as fully unchanged", () => {
    // Arrange
    const text = "no edits here";

    // Act
    const { del, add } = granularSegments(text, text);

    // Assert
    expect(del.every((s) => s.kind === "same")).toBe(true);
    expect(add.every((s) => s.kind === "same")).toBe(true);
  });
});

describe("splitCommon", () => {
  it("splits a shared prefix, the differing middles, and a shared suffix", () => {
    // Arrange — differs in the middle, shares prefix and suffix.
    const oldText = "XmiddleY";
    const newText = "ZmiddleY";

    // Act
    const split = splitCommon(oldText, newText);

    // Assert
    expect(split).toEqual({ prefix: "", oldMid: "X", newMid: "Z", suffix: "middleY" });
  });

  it("round-trips: prefix + mid + suffix reconstructs both inputs", () => {
    // Arrange
    const oldText = "foobar";
    const newText = "foobaz";

    // Act
    const { prefix, oldMid, newMid, suffix } = splitCommon(oldText, newText);

    // Assert
    expect(prefix + oldMid + suffix).toBe(oldText);
    expect(prefix + newMid + suffix).toBe(newText);
  });

  it("does not split astral characters (emoji) across surrogate pairs", () => {
    // Arrange — "word" prefix then two different emoji. The naive char-by-char
    // common-prefix would stop inside the first emoji's surrogate pair; the
    // surrogate nudge must back off so the emoji stays intact in the prefix.
    const oldText = "word😀"; // U+1F600 = 😀
    const newText = "word😎"; // U+1F60E = 😎

    // Act
    const split = splitCommon(oldText, newText);

    // Assert
    expect(split.prefix).toBe("word");
    expect(split.oldMid).toBe("😀");
    expect(split.newMid).toBe("😎");
    expect(split.suffix).toBe("");
    // And the round-trip still holds.
    expect(split.prefix + split.oldMid + split.suffix).toBe(oldText);
    expect(split.prefix + split.newMid + split.suffix).toBe(newText);
  });
});
