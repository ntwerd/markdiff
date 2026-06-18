import { readFile } from "node:fs/promises";
import type { Repo } from "../git/repo";
import { attachAuthors, parseBlamePorcelain } from "./blame";
import { parseUnifiedDiff } from "./parse";
import { expandDiffToWholeFile } from "./wholeFile";
import type { FileDiff } from "./types";

/** Outcome of building a file diff for rendering. */
export type DiffLoadResult =
  | { status: "ok"; diff: FileDiff }
  | { status: "no-changes" }
  | { status: "error"; message: string };

export interface LoadFileDiffOptions {
  /** Ref compared against the working tree. */
  baseRef: string;
  /** Expand the diff to show the whole file around the changed hunks. */
  wholeFile: boolean;
  /** Attach per-line commit authors via git blame. */
  colorByAuthor: boolean;
}

/**
 * Run the markdiff diff pipeline for one repo-relative file: fetch the unified
 * diff, parse and refine it, optionally expand to the whole file, and attach
 * per-line authors. Returns a discriminated result the caller renders — keeping
 * the view a thin renderer and making the pipeline independently testable.
 */
export async function loadFileDiff(
  repo: Repo,
  relPath: string,
  absPath: string,
  options: LoadFileDiffOptions,
): Promise<DiffLoadResult> {
  const unified = await repo.diffRefs(relPath, options.baseRef);
  if (!unified.trim()) return { status: "no-changes" };

  const fileDiffs = parseUnifiedDiff(unified);
  let diff = fileDiffs.find((d) => d.newPath === relPath || d.oldPath === relPath) ?? fileDiffs[0];
  if (!diff) return { status: "error", message: "No diff to display." };

  if (options.wholeFile) {
    diff = expandDiffToWholeFile(diff, await readFile(absPath, "utf8"));
  }

  if (options.colorByAuthor) {
    diff = await attachAuthorsSafe(repo, relPath, diff);
  }

  return { status: "ok", diff };
}

/**
 * Attach per-line authors from git blame. Blame fails for untracked/unborn
 * files; in that case the diff is returned unchanged so it still renders
 * (without author colour).
 */
async function attachAuthorsSafe(repo: Repo, relPath: string, diff: FileDiff): Promise<FileDiff> {
  try {
    const blame = await repo.blamePorcelain(relPath);
    return attachAuthors(diff, parseBlamePorcelain(blame));
  } catch {
    return diff;
  }
}
