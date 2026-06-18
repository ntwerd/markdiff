import { describe, it, expect } from "vitest";
import { detectFence, isClosingFence } from "../src/lib/fence";

describe("detectFence", () => {
  it("detects a backtick fence opener with an info string", () => {
    expect(detectFence("```js")).toEqual({ char: "`", length: 3 });
  });

  it("detects four-or-more backticks and tildes", () => {
    expect(detectFence("````")).toEqual({ char: "`", length: 4 });
    expect(detectFence("~~~")).toEqual({ char: "~", length: 3 });
    expect(detectFence("~~~~python")).toEqual({ char: "~", length: 4 });
  });

  it("returns null for non-fence lines", () => {
    expect(detectFence("plain text")).toBeNull();
    expect(detectFence("`` two only")).toBeNull(); // fewer than three
    expect(detectFence("  ```")).toBeNull(); // leading whitespace not allowed
  });
});

describe("isClosingFence", () => {
  const opening = { char: "`", length: 3 };

  it("matches a closing fence with at least as many of the same character", () => {
    expect(isClosingFence("```", opening)).toBe(true);
    expect(isClosingFence("````", opening)).toBe(true); // more is fine
    expect(isClosingFence("```  ", opening)).toBe(true); // trailing whitespace ok
  });

  it("rejects too-short fences, trailing content, and the wrong character", () => {
    expect(isClosingFence("``", opening)).toBe(false); // fewer than opening
    expect(isClosingFence("```js", opening)).toBe(false); // trailing info string
    expect(isClosingFence("~~~", opening)).toBe(false); // different character
  });

  it("respects a longer opening fence", () => {
    const tilde4 = { char: "~", length: 4 };
    expect(isClosingFence("~~~~", tilde4)).toBe(true);
    expect(isClosingFence("~~~", tilde4)).toBe(false); // shorter than opening
  });
});
