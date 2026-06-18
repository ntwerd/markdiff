import { describe, it, expect, vi } from "vitest";
import { loadFileDiff } from "../src/diff/pipeline";
import type { Repo } from "../src/git/repo";

const REL_PATH = "note.md";

/** Minimal unified diff for note.md changing one line. */
function unifiedDiff(): string {
  return ["--- a/" + REL_PATH, "+++ b/" + REL_PATH, "@@ -1,1 +1,1 @@", "-old", "+new"].join("\n");
}

/** A duck-typed Repo stub implementing only the surface loadFileDiff touches. */
function fakeRepo(overrides: Partial<Pick<Repo, "diffRefs" | "blamePorcelain">> = {}): Repo {
  return {
    diffRefs: overrides.diffRefs ?? vi.fn(async () => unifiedDiff()),
    blamePorcelain:
      overrides.blamePorcelain ??
      vi.fn(async () => "abc1234 1 1\nauthor Alice\n\tauthor line\n\tnew"),
  } as unknown as Repo;
}

describe("loadFileDiff", () => {
  it("returns the parsed diff on a normal change", async () => {
    // Arrange
    const repo = fakeRepo();

    // Act
    const result = await loadFileDiff(repo, REL_PATH, "/vault/note.md", {
      baseRef: "HEAD",
      wholeFile: false,
      colorByAuthor: false,
    });

    // Assert
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.diff.newPath).toBe(REL_PATH);
    expect(result.diff.hunks[0].lines).toHaveLength(2);
  });

  it("returns no-changes when the diff is empty", async () => {
    // Arrange
    const repo = fakeRepo({ diffRefs: vi.fn(async () => "   ") });

    // Act
    const result = await loadFileDiff(repo, REL_PATH, "/vault/note.md", {
      baseRef: "HEAD",
      wholeFile: false,
      colorByAuthor: false,
    });

    // Assert
    expect(result.status).toBe("no-changes");
  });

  it("attaches authors when color-by-author is enabled", async () => {
    // Arrange
    const repo = fakeRepo({
      blamePorcelain: vi.fn(async () => "abc1234 1 1\nauthor Alice\n\tnew"),
    });

    // Act
    const result = await loadFileDiff(repo, REL_PATH, "/vault/note.md", {
      baseRef: "HEAD",
      wholeFile: false,
      colorByAuthor: true,
    });

    // Assert — the add line (newLine 1) gets the blamed author.
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const addLine = result.diff.hunks[0].lines.find((l) => l.kind === "add");
    expect(addLine?.author).toBe("Alice");
  });

  it("still returns the diff when blame fails (e.g. untracked file)", async () => {
    // Arrange
    const repo = fakeRepo({ blamePorcelain: vi.fn(async () => Promise.reject(new Error("nope"))) });

    // Act
    const result = await loadFileDiff(repo, REL_PATH, "/vault/note.md", {
      baseRef: "HEAD",
      wholeFile: false,
      colorByAuthor: true,
    });

    // Assert — graceful degradation: diff renders without author colour.
    expect(result.status).toBe("ok");
  });
});
