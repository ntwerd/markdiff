import { describe, it, expect } from "vitest";
import { assertSafeRef, assertSafePath, hardenedEnv, UnsafeArgumentError } from "../src/git/security";

describe("assertSafeRef", () => {
  it.each(["HEAD", "HEAD~1", "HEAD^", "feature/foo", "v1.2.3", "main", "refs/heads/main", "@{u}"])(
    "accepts a valid ref: %s",
    (ref) => {
      expect(assertSafeRef(ref)).toBe(ref.trim());
    },
  );

  it("rejects an empty ref", () => {
    expect(() => assertSafeRef("")).toThrow(UnsafeArgumentError);
  });

  it("rejects a whitespace-only ref", () => {
    expect(() => assertSafeRef("   ")).toThrow(UnsafeArgumentError);
  });

  it("rejects a ref that begins with '-' (option injection)", () => {
    expect(() => assertSafeRef("-x")).toThrow(UnsafeArgumentError);
  });

  it("rejects refs with whitespace or shell metacharacters", () => {
    expect(() => assertSafeRef("foo bar")).toThrow(UnsafeArgumentError);
    expect(() => assertSafeRef("foo;bar")).toThrow(UnsafeArgumentError);
    expect(() => assertSafeRef("foo$BAR")).toThrow(UnsafeArgumentError);
  });

  it("rejects a ref longer than the max length", () => {
    expect(() => assertSafeRef("a".repeat(257))).toThrow(UnsafeArgumentError);
  });
});

describe("assertSafePath", () => {
  it("accepts ordinary repo-relative paths (including spaces)", () => {
    expect(assertSafePath("note.md")).toBe("note.md");
    expect(assertSafePath("folder/note.md")).toBe("folder/note.md");
    expect(assertSafePath("my notes/file.md")).toBe("my notes/file.md");
  });

  it("rejects empty, NUL, and newline/carriage-return characters", () => {
    expect(() => assertSafePath("")).toThrow(UnsafeArgumentError);
    expect(() => assertSafePath("a\0b")).toThrow(UnsafeArgumentError);
    expect(() => assertSafePath("a\nb")).toThrow(UnsafeArgumentError);
    expect(() => assertSafePath("a\rb")).toThrow(UnsafeArgumentError);
  });

  it("rejects a path that begins with '-'", () => {
    expect(() => assertSafePath("-x")).toThrow(UnsafeArgumentError);
  });
});

describe("hardenedEnv", () => {
  it("deletes guard-flagged keys and forces GIT_TERMINAL_PROMPT off", () => {
    // Arrange
    const input = {
      PATH: "/usr/bin",
      HOME: "/users/me",
      GIT_EXTERNAL_DIFF: "/tmp/evil",
      GIT_SSH_COMMAND: "evil-script",
      GIT_EDITOR: "nano",
      EDITOR: "vim",
    };

    // Act
    const env = hardenedEnv(input);

    // Assert — flagged keys removed, benign keys retained, prompt forced off.
    expect(env.GIT_EXTERNAL_DIFF).toBeUndefined();
    expect(env.GIT_SSH_COMMAND).toBeUndefined();
    expect(env.GIT_EDITOR).toBeUndefined();
    expect(env.EDITOR).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/users/me");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});
