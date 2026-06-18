import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import { dirname, relative, sep } from "node:path";
import { realpath } from "node:fs/promises";
import process from "node:process";

/** Thrown when a user-controlled ref or path fails validation. */
export class UnsafeArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeArgumentError";
  }
}

// Refs are passed as discrete argv elements to a shell-less spawn, so the only
// realistic injection vector is a leading "-" being parsed as an option. We
// additionally whitelist the characters git revisions actually use.
const REF_ALLOWED = /^[A-Za-z0-9._/~^@{}+-]+$/;
const MAX_REF_LENGTH = 256;

/**
 * Validate a user-controlled git ref before it reaches git. Rejects empty
 * refs, refs that begin with "-" (option injection), and refs containing
 * control/whitespace characters or anything outside the revision grammar.
 */
export function assertSafeRef(ref: string): string {
  const r = ref.trim();
  if (r.length === 0 || r.length > MAX_REF_LENGTH) {
    throw new UnsafeArgumentError(`Invalid git ref: ${JSON.stringify(ref)}`);
  }
  if (r.startsWith("-")) {
    throw new UnsafeArgumentError(`Git ref must not start with '-': ${JSON.stringify(ref)}`);
  }
  if (!REF_ALLOWED.test(r)) {
    throw new UnsafeArgumentError(`Git ref has unsupported characters: ${JSON.stringify(ref)}`);
  }
  return r;
}

/**
 * Validate a repo-relative path before it is embedded in a `ref:path`
 * revision (which is not protected by a `--` separator).
 */
export function assertSafePath(p: string): string {
  if (p.length === 0 || p.includes("\0") || /[\n\r]/.test(p)) {
    throw new UnsafeArgumentError(`Invalid path: ${JSON.stringify(p)}`);
  }
  if (p.startsWith("-")) {
    throw new UnsafeArgumentError(`Path must not start with '-': ${JSON.stringify(p)}`);
  }
  return p;
}

/**
 * Environment overrides that neutralise malicious-repo escape vectors.
 *
 * The dangerous vars are *removed* (set to `undefined`, which child_process
 * drops) rather than set to `""` — an empty `GIT_EXTERNAL_DIFF` makes git try
 * to exec an empty command and fail every diff. `core.pager=cat` is already
 * forced via config, and `GIT_PAGER=cat` keeps a safe pager if one is read.
 */
function hardenedEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    GIT_EXTERNAL_DIFF: undefined,
    GIT_PAGER: "cat",
    GIT_SSH: undefined,
    GIT_SSH_COMMAND: undefined,
    GIT_SSH_VARIANT: undefined,
    GIT_TERMINAL_PROMPT: "0",
  };
}

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
      // Harden against malicious-repo RCE via .gitattributes / config.
      config: ["diff.external=", "core.pager=cat"],
    };
    return simpleGit(options).env(hardenedEnv());
  }

  private static async bind(baseDir: string, gitBinary?: string): Promise<Repo | null> {
    const git = Repo.create(baseDir, gitBinary);
    try {
      const root = (await git.revparse(["--show-toplevel"])).trim();
      await git.cwd(root);
      return new Repo(root, git);
    } catch {
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
    const args = refB
      ? ["--no-textconv", a, assertSafeRef(refB), "--", path]
      : ["--no-textconv", a, "--", path];
    return this.git.diff(args);
  }

  /**
   * Unified diff between two arbitrary files (no repo membership required).
   * Both inputs are `realpath`-confined under `confineDir` (the vault root) to
   * stop `--no-index` from reading files outside the vault.
   */
  async diffFiles(absFileA: string, absFileB: string, confineDir: string): Promise<string> {
    const realA = await confineUnder(absFileA, confineDir);
    const realB = await confineUnder(absFileB, confineDir);
    // --no-index exits non-zero when the files differ; swallow that.
    try {
      return await this.git.diff(["--no-index", "--no-textconv", "--", realA, realB]);
    } catch (err: unknown) {
      const e = err as { git?: { stdout?: string } };
      if (e.git?.stdout) return e.git.stdout;
      throw err;
    }
  }

  /** Read a file's contents at a given ref without touching the working tree. */
  async showAtRef(relPath: string, ref: string): Promise<string> {
    const r = assertSafeRef(ref);
    const path = assertSafePath(relPath);
    return this.git.raw(["show", "--no-textconv", `${r}:${path}`]);
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

/**
 * Resolve `absPath` and require it to live inside `confineDir`. Throws
 * UnsafeArgumentError if the resolved real path escapes the confinement root.
 */
async function confineUnder(absPath: string, confineDir: string): Promise<string> {
  const realRoot = await realpath(confineDir);
  const real = await realpath(absPath);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    throw new UnsafeArgumentError(`Path escapes the vault: ${JSON.stringify(absPath)}`);
  }
  return real;
}
