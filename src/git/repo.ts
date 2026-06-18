import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import { dirname, relative, sep } from "node:path";
import { assertSafePath, assertSafeRef, hardenedEnv } from "./security";

/**
 * Thin wrapper over simple-git for the operations markdiff needs.
 *
 * All refs and paths are passed as discrete array elements (never interpolated
 * into a string), and pathspecs are always preceded by `--`, to avoid argument
 * injection. simple-git uses `spawn` with shell:false, so shell metacharacters
 * are inert. User-controlled refs and paths are additionally validated, and
 * the child process environment is hardened against malicious repositories.
 */
export class Repo {
  private constructor(
    readonly root: string,
    private readonly git: SimpleGit,
  ) {}

  private static create(baseDir: string, gitBinary?: string): SimpleGit {
    const options: Partial<SimpleGitOptions> = {
      baseDir,
      binary: gitBinary && gitBinary.length > 0 ? gitBinary : "git",
      maxConcurrentProcesses: 4,
    };
    return simpleGit(options).env(hardenedEnv());
  }

  private static async bind(baseDir: string, gitBinary?: string): Promise<Repo | null> {
    const git = Repo.create(baseDir, gitBinary);
    try {
      const root = (await git.revparse(["--show-toplevel"])).trim();
      await git.cwd(root);
      return new Repo(root, git);
    } catch (err) {
      // Don't swallow silently: a real git failure (missing binary, guard
      // throw, permissions) otherwise shows as "not inside a Git repository"
      // in the UI. Log so the actual cause is visible in the devtools console.
      console.error("[markdiff] git repo bind failed for", baseDir, err);
      return null;
    }
  }

  /**
   * Resolve the repository root that owns `absFilePath` and return a Repo bound
   * to it. Returns null if the file is not inside a git repository.
   */
  static forFile(absFilePath: string, gitBinary?: string): Promise<Repo | null> {
    return Repo.bind(dirname(absFilePath), gitBinary);
  }

  /**
   * Resolve the repository root that owns `absDir` and return a Repo bound to
   * it. Returns null if the directory is not inside a git repository.
   */
  static forDir(absDir: string, gitBinary?: string): Promise<Repo | null> {
    return Repo.bind(absDir, gitBinary);
  }

  /** Repo-relative, forward-slash path for an absolute file inside the repo. */
  relPathFor(absFilePath: string): string {
    return relative(this.root, absFilePath).split(sep).join("/");
  }

  /** Unified diff of one path between two refs (defaults to a ref vs working tree). */
  async diffRefs(relPath: string, refA: string, refB?: string): Promise<string> {
    const a = assertSafeRef(refA);
    const path = assertSafePath(relPath);
    // --no-ext-diff ignores any `diff.external` config / GIT_EXTERNAL_DIFF so a
    // malicious repo can't run an arbitrary program during the diff. Setting
    // `diff.external` to empty via `-c` would instead *activate* external diff
    // with an empty program name ("cannot run : No such file"); --no-ext-diff
    // is the correct neutraliser.
    const args = refB
      ? ["--no-ext-diff", "--no-textconv", a, assertSafeRef(refB), "--", path]
      : ["--no-ext-diff", "--no-textconv", a, "--", path];
    return this.git.diff(args);
  }

  /** Per-line author attribution for color-by-author. */
  async blamePorcelain(relPath: string, ref?: string): Promise<string> {
    const path = assertSafePath(relPath);
    const args = ["blame", "--line-porcelain", "--no-textconv"];
    if (ref) args.push(assertSafeRef(ref));
    args.push("--", path);
    return this.git.raw(args);
  }

  /** Restore a path to the version at `ref` (mutates the working tree). */
  async restore(relPath: string, ref: string): Promise<void> {
    const r = assertSafeRef(ref);
    const path = assertSafePath(relPath);
    await this.git.checkout([r, "--", path]);
  }

  /** List every changed file (porcelain status). */
  async changedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [...status.files.map((f) => f.path)];
  }

  /** Changed files filtered to Markdown notes, for the changed-files browser. */
  async changedMarkdownFiles(): Promise<string[]> {
    const files = await this.changedFiles();
    return files.filter((p) => /\.(md|markdown)$/i.test(p));
  }
}
