# markdiff — tech stack & architecture

This document records the libraries chosen for markdiff and why, plus the data
flow they are intended to implement. It is the reference for anyone extending
the plugin.

markdiff is currently an implementation scaffold. The git wrapper, diff parser,
settings UI, command registration, and initial renderer exist. The inline note
UI, changed-files browser, restore UI, blame-to-line author mapping, and
character-span wrapping inside rendered Markdown are still TODOs. Compact
partial-line grouping, such as the README example `H[-i there,-][+ello World!+]`,
is also target UI behavior rather than current scaffold output.

## Goals recap

markdiff is intended to render git diffs of Markdown notes as **rendered
Markdown**, with:

- comparison of any two versions of a note, or two different files;
- **character-level** diffs highlighted *inside* the rendered rich text;
- compact partial-line edits that keep unchanged text readable while showing
  removed and added text inline at the edit point;
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

No other package is added as a direct runtime dependency. `simple-git` brings a
small set of transitive packages, and esbuild bundles those unless they are
listed as externals. CodeMirror (`@codemirror/*`, `@lezer/*`), `electron`,
`obsidian`, and Node builtins are provided by the host at runtime and listed as
esbuild **externals**.

### Research snapshot

Checked on June 18, 2026. Package versions and download counts are
time-sensitive, so refresh this section before a dependency upgrade. The npm
registry values were rechecked on June 18, 2026, while aligning this document
with `README.md`.

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

The development tooling follows the same shape as the official
`obsidian-sample-plugin`. The versions below are the package specs in
`package.json`; caret ranges can resolve to newer installed patch or minor
versions.

| Package | Package spec | Role |
|---------|---------|------|
| `obsidian` | `1.13.1` | API typings (external, not bundled) |
| `esbuild` | `0.25.5` | Bundler |
| `builtin-modules` | `^5.0.0` | Feeds Node builtins into esbuild externals |
| `typescript` | `^5.8.3` | Compiler / type-check (`tsc -noEmit`) |
| `@types/node` | `^22.15.17` | Node typings (for `child_process`, `path`) |
| `eslint` + `@eslint/js` + `typescript-eslint` | `^9.39.4` / `^9.39.4` / `^8.59.1` | Lint (flat config) |
| `eslint-plugin-obsidianmd` | `^0.3.0` | Obsidian submission-readiness rules |
| `globals`, `jiti` | `^17.6.0`, `^2.6.1` | ESLint flat-config support |

`esbuild.config.mjs` writes the bundle to `main.js` at the repository root. The
manual install flow copies `main.js`, `manifest.json`, and `styles.css` into the
vault plugin directory.

`package.json` runs `tsc -noEmit` before the production bundle. `tsconfig.json`
sets `skipLibCheck` so external Obsidian API typings do not block source
type-checking.

## Target architecture & data flow

The source tree is shaped around this pipeline, but `src/main.ts` does not call
the full flow yet. The registered commands still throw `Not implemented`.

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
                  │  TODO: compact partial-line grouping for the UI
                  ▼
            FileDiff (diff/types.ts)
                  │  + per-line author from Repo.blamePorcelain()
                  ▼
            renderFileDiff()               (render/renderDiff.ts)
                  │  MarkdownRenderer.render() per line
                  │  TODO: wrap character segments in .markdiff-add /
                  │        .markdiff-del
                  ▼
            inline in the note's reading view
```

`renderFileDiff()` currently renders whole diff lines through
`MarkdownRenderer.render()`. It accepts parsed character segments, but the DOM
post-processing that wraps those segments inside rendered Markdown has not been
implemented yet.

`parseUnifiedDiff()` currently refines only immediately adjacent delete/add
line pairs. It does not yet pair full multi-line delete/add runs, so larger
paragraph rewrites need a smarter line-pairing step before character
normalization.

### Partial-line edit target

The README uses `Hi there,` → `Hello World!` to show the intended compact
partial-line treatment:

```
H[-i there,-][+ello World!+]
```

This display keeps the unchanged prefix visible, strikes through removed text,
and inserts added text at the same edit point. The current parser delegates to
jsdiff's `diffChars`, which can preserve interior matching characters as
separate unchanged segments. For the README example, `diffChars` keeps `H`, `e`,
and `r` as unchanged segments. If the compact display remains the desired UI,
add a normalization step after `diffChars` or in the renderer before DOM
wrapping.

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

Some guardrails are implemented in `git/repo.ts`; others must be added before
shipping user-facing file comparison and restore flows.

Implemented:

- **Discrete git arguments:** diff, blame, and restore commands pass refs and
  paths as array elements rather than shell strings. Pathspec-style commands
  put `--` before file paths.
- **Basic diff hardening:** `Repo.forFile()` sets `diff.external=` and
  `core.pager=cat` through simple-git config.
- **macOS Electron PATH setting:** `settings.ts` exposes an optional git binary
  path for GUI-launched Obsidian sessions that do not inherit the shell `$PATH`.
- **Desktop-only manifest:** `manifest.json` sets `isDesktopOnly: true`, because
  native git access is unavailable on Obsidian mobile.

Still required:

- **Constrain `--no-index`:** `Repo.diffFiles()` currently accepts arbitrary
  absolute paths. Before exposing file-to-file comparison in the UI,
  `realpath`-confine both inputs under the vault.
- **Filter changed files for the UI:** `Repo.changedFiles()` returns every git
  status path. The changed-files browser described in `README.md` must filter
  that list to Markdown notes before display.
- **Validate refs:** reject leading-`-` refs and invalid revision strings before
  passing user-controlled refs into `diffRefs()`, `showAtRef()`,
  `blamePorcelain()`, or `restore()`.
- **Complete malicious-repo hardening:** add `--no-textconv` where applicable
  and clear `GIT_EXTERNAL_DIFF`, `GIT_PAGER`, and `GIT_SSH*` in the child
  process environment for untrusted repos.
- **Review `showAtRef()`:** it currently builds a `ref:path` revision string.
  Keep this behind ref/path validation before exposing restore or preview flows.

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
    └── renderDiff.ts    render whole FileDiff lines via MarkdownRenderer
```
