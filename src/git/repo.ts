import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import { dirname } from "node:path";

/**
 * Thin wrapper over simple-git for the operations markdiff needs.
 *
 * All refs and paths are passed as discrete array elements (never interpolated
 * into a string), and pathspecs are always preceded by `--`, to avoid argument
 * injection. simple-git uses `spawn` with shell:false, so shell metacharacters
 * are inert.
 */
export class Repo {
  private constructor(
    readonly root: string,
    private readonly git: SimpleGit,
  ) {}

  /**
   * Resolve the repository root that owns `absFilePath` and return a Repo bound
   * to it. Returns null if the file is not inside a git repository.
   */
  static async forFile(absFilePath: string, gitBinary?: string): Promise<Repo | null> {
    const options: Partial<SimpleGitOptions> = {
      baseDir: dirname(absFilePath),
      binary: gitBinary && gitBinary.length > 0 ? gitBinary : "git",
      maxConcurrentProcesses: 4,
      // Harden against malicious-repo RCE via .gitattributes / config.
      config: ["diff.external=", "core.pager=cat"],
    };
    const git = simpleGit(options);

    try {
      const root = (await git.revparse(["--show-toplevel"])).trim();
      await git.cwd(root);
      return new Repo(root, git);
    } catch {
      return null;
    }
  }

  /** Unified diff of one path between two refs (defaults to HEAD vs working tree). */
  async diffRefs(relPath: string, refA: string, refB?: string): Promise<string> {
    const args = refB ? [refA, refB, "--", relPath] : [refA, "--", relPath];
    return this.git.diff(args);
  }

  /** Unified diff between two arbitrary files (no repo membership required). */
  async diffFiles(absFileA: string, absFileB: string): Promise<string> {
    // --no-index exits non-zero when the files differ; swallow that.
    try {
      return await this.git.diff(["--no-index", "--", absFileA, absFileB]);
    } catch (err: unknown) {
      const e = err as { git?: { stdout?: string } };
      if (e.git?.stdout) return e.git.stdout;
      throw err;
    }
  }

  /** Read a file's contents at a given ref without touching the working tree. */
  async showAtRef(relPath: string, ref: string): Promise<string> {
    return this.git.raw(["show", `${ref}:${relPath}`]);
  }

  /** Per-line author attribution for color-by-author. */
  async blamePorcelain(relPath: string, ref?: string): Promise<string> {
    const args = ["blame", "--line-porcelain"];
    if (ref) args.push(ref);
    args.push("--", relPath);
    return this.git.raw(args);
  }

  /** Restore a path to the version at `ref` (mutates the working tree). */
  async restore(relPath: string, ref: string): Promise<void> {
    await this.git.checkout([ref, "--", relPath]);
  }

  /** List changed files (porcelain status). */
  async changedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [...status.files.map((f) => f.path)];
  }
}
