import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import { dirname, relative, sep } from "node:path";
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
 * Every git env var that simple-git's vulnerability guard flags (or that git
 * itself could use to exec an arbitrary program) is *deleted* from the copy
 * rather than set to `""` / `undefined`: simple-git stringifies `undefined`
 * values and still flags the key, and an empty `GIT_EXTERNAL_DIFF` would make
 * git try to exec an empty command. Deleting keeps the key out of both the
 * guard and the child process. `GIT_TERMINAL_PROMPT` is set to stop git from
 * blocking on a credentials prompt; it is not a guard-flagged key.
 */
const FLAGGED_GIT_ENV_KEYS: ReadonlySet<string> = new Set([
  "editor",
  "git_askpass",
  "git_config_global",
  "git_config_system",
  "git_config_count",
  "git_config",
  "git_editor",
  "git_exec_path",
  "git_external_diff",
  "git_pager",
  "git_proxy_command",
  "git_template_dir",
  "git_sequence_editor",
  "git_ssh",
  "git_ssh_command",
  "pager",
  "prefix",
  "ssh_askpass",
]);

/**
 * Build the child-process environment for git, with every guard-flagged key
 * deleted and `GIT_TERMINAL_PROMPT` forced off. Accepts an optional `env`
 * (defaults to the live `process.env`) so the filtering is unit-testable
 * without touching the real environment.
 */
export function hardenedEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (FLAGGED_GIT_ENV_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  out.GIT_TERMINAL_PROMPT = "0";
  return out;
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
