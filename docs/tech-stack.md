# markdiff — tech stack & architecture

This document records the libraries chosen for markdiff and why, plus the data
flow they implement. It is the reference for anyone extending the plugin.

## Goals recap

markdiff renders git diffs of Markdown notes as **rendered Markdown**, with:

- comparison of any two versions of a note, or two different files;
- **character-level** diffs highlighted *inside* the rendered rich text;
- color-coding by change type and by commit author;
- navigation between changes and one-click restore of a version;
- inline diff mode in the active note and a vault-wide changed-files list.

Desktop-only — it shells out to the real `git` binary.

## Runtime dependencies (deliberately minimal)

| Need | Library | Version | Why |
|------|---------|---------|-----|
| Git access | **`simple-git`** | `^3.36.0` | MIT, bundled TypeScript types, configurable `git` binary, and direct access to native `git diff`, `git blame`, `git show`, and restore commands. Keeping native Git preserves CLI parity for desktop vaults. |
| Diff parsing + character refinement | **`diff`** (jsdiff) | `^9.0.0` | BSD-3-Clause, bundled TypeScript types, no runtime dependencies, and one package for both unified-diff parsing (`parsePatch`) and character refinement (`diffChars`). |
| Markdown rendering | *(none: host API)* | - | Obsidian's built-in `MarkdownRenderer.render(app, md, el, sourcePath, component)` renders the Markdown through the same host pipeline the note uses. |

Nothing else is bundled. CodeMirror (`@codemirror/*`, `@lezer/*`), `electron`,
`obsidian`, and Node builtins are all provided by the host at runtime and listed
as esbuild **externals**.

### Research snapshot

Checked on June 18, 2026. Package versions and download counts are
time-sensitive, so refresh this section before a dependency upgrade.

| Package | Current npm version | License | npm downloads, June 10-16, 2026 | Notes |
|---------|---------------------|---------|----------------------------------|-------|
| [`simple-git`](https://www.npmjs.com/package/simple-git) | `3.36.0` | MIT | 10,774,043 | Requires a system `git` binary and ships bundled TypeScript definitions. See the [`simple-git` README](https://github.com/steveukx/git-js). |
| [`diff`](https://www.npmjs.com/package/diff) | `9.0.0` | BSD-3-Clause | 123,319,566 | Provides `diffChars`, `parsePatch`, `applyPatch`, ESM/CJS exports, and bundled TypeScript definitions. See the [jsdiff README](https://github.com/kpdecker/jsdiff). |
| [`obsidian`](https://www.npmjs.com/package/obsidian) | `1.13.1` | MIT | n/a | API typings only. Runtime APIs come from Obsidian, and this package remains external in the bundle. |

### Libraries considered and rejected

- **`isomorphic-git`** - active pure-JS Git implementation for Node and browsers.
  It is a good fit for browser/mobile Git workflows, but markdiff is
  desktop-only and needs exact native `git diff` and `git blame` behavior.
  Its public API lists status, log, checkout, commit, and object operations, but
  not equivalent porcelain `diff` or `blame` commands.
- **`diff-match-patch`** - high-quality plain-text diff algorithm, but the
  upstream Google repository is archived, and the npm package doesn't solve
  unified patch parsing. Using it would still require a second parser.
- **`fast-diff`** - fast character-level string diff with bundled types, but it
  only returns string edit tuples. It does not parse unified diffs, so it would
  duplicate the character-refinement piece that jsdiff already provides.
- **`parse-diff`** - current package has types and recent npm activity, but it
  only parses unified diffs. `diff@^9` already covers parsing and character
  refinement in one dependency.
- **`parse-git-diff`** - typed and recently published, but much smaller adoption
  than `diff` and still parser-only. Use it only if jsdiff's `parsePatch`
  structure becomes a blocker.
- **`gitdiff-parser`** - typed MIT parser, but it is parser-only and has had no
  recent npm release. It doesn't replace jsdiff's character refinement.
- **`diff2html`** - renders unified diffs as HTML, but markdiff needs rendered
  Markdown from Obsidian plus highlights inside that rich text. It also brings
  templating dependencies and would bypass the host Markdown renderer.
- Raw `child_process` - keep this as an escape hatch only. `simple-git` already
  centralizes binary selection, working directory, config, task queueing, and
  raw argument passing for commands that do not have a typed wrapper.

## Build & dev tooling (devDependencies)

Mirrors the current official `obsidian-sample-plugin`:

| Package | Version | Role |
|---------|---------|------|
| `obsidian` | `latest` | API typings (external, not bundled) |
| `esbuild` | `0.25.5` | Bundler |
| `builtin-modules` | `^5.0.0` | Feeds Node builtins into esbuild externals |
| `typescript` | `^5.8.3` | Compiler / type-check (`tsc -noEmit`) |
| `@types/node` | `^22.15.17` | Node typings (for `child_process`, `path`) |
| `eslint` + `@eslint/js` + `typescript-eslint` | `^9.39` / `^8.59` | Lint (flat config) |
| `eslint-plugin-obsidianmd` | `^0.3.0` | Obsidian submission-readiness rules |
| `globals`, `jiti` | — | ESLint flat-config support |

## Architecture & data flow

```
active note ──▶ Repo.forFile()            (git/repo.ts)
                  │  resolve repo root, bind simple-git
                  ▼
            Repo.diffRefs() / diffFiles()  ── unified diff string
                  │
                  ▼
            parseUnifiedDiff()             (diff/parse.ts)
                  │  parsePatch → hunks of add/del/context lines
                  │  refineCharacters → diffChars per del/add pair
                  ▼
            FileDiff (diff/types.ts)
                  │  + per-line author from Repo.blamePorcelain()
                  ▼
            renderFileDiff()               (render/renderDiff.ts)
                  │  MarkdownRenderer.render() per line
                  │  wrap character segments in .markdiff-add / .markdiff-del
                  ▼
            inline in the note's reading view
```

### Why the reading view, not CodeMirror decorations

CodeMirror 6 `Decoration.mark` can only highlight **raw source text** in the
editor — it cannot style spans *inside rendered Markdown*. Since the requirement
is a *rendered* diff, markdiff renders through `MarkdownRenderer.render()` and
post-processes the resulting DOM. Reach for CM6 decorations only if a future
"live source diff in the editor" feature is wanted.

### `MarkdownRenderer` lifecycle

`MarkdownRenderer.render(app, markdown, el, sourcePath, component)` — the
`component` argument owns the lifecycle of anything the rendered Markdown spawns
(embeds, transclusions). Pass a `Component` you control and `.unload()` it when
leaving diff mode, or those children leak. (`renderMarkdown()` is the deprecated
no-`app` form — don't use it.)

## Security & platform guardrails

These are enforced in `git/repo.ts` and must be preserved:

- **No argument injection:** refs and paths are passed as **discrete array
  elements**, never interpolated; pathspecs are always preceded by `--`.
- **`--no-index` is an arbitrary-file-read primitive** — `realpath`-confine both
  inputs under the vault before using it for file-to-file compare.
- **Reject leading-`-` refs** so a ref can't be parsed as a git option.
- **Harden against malicious-repo RCE** via `.gitattributes`: run with
  `-c diff.external=` and `--no-textconv`, and clear `GIT_EXTERNAL_DIFF` /
  `GIT_PAGER` / `GIT_SSH*` in the environment for untrusted repos.
- **macOS Electron PATH:** GUI-launched Obsidian does **not** inherit the shell
  `$PATH`, so a Homebrew `git` at `/opt/homebrew/bin` is invisible. Expose a
  configurable git-binary path setting (already in `settings.ts`).
- `manifest.json` sets **`isDesktopOnly: true`** — `child_process` is unavailable
  on mobile.

## Source layout

```
src/
├── main.ts              plugin entry — commands, ribbon, settings wiring
├── settings.ts          settings model + settings tab
├── git/
│   └── repo.ts          simple-git wrapper (diff, blame, show, restore, status)
├── diff/
│   ├── types.ts         FileDiff / DiffHunk / DiffLine / TextSegment
│   └── parse.ts         unified-diff parsing + character-level refinement
└── render/
    └── renderDiff.ts    render a FileDiff inline via MarkdownRenderer
```
