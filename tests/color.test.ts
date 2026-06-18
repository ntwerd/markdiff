import { describe, it, expect } from "vitest";
import { colorForAuthor } from "../src/lib/color";

describe("colorForAuthor", () => {
  it("returns a stable oklch colour for the same author", () => {
    expect(colorForAuthor("Alice")).toBe(colorForAuthor("Alice"));
    expect(colorForAuthor("Alice")).toMatch(/^oklch\(70% 0\.12 \d+\)$/);
  });

  it("assigns different authors different colours", () => {
    expect(colorForAuthor("Alice")).not.toBe(colorForAuthor("Bob"));
  });
});
