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
