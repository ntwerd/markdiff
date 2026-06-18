# markdiff — tech stack & architecture

This document records the libraries chosen for markdiff and why, plus the data
flow they are intended to implement. It is the reference for anyone extending
the plugin.

markdiff is functional end to end. The git wrapper, the unified-diff parser
(with multi-line del/add pairing and character refinement), the inline diff view
(compare banner, display-mode selector, change navigation, restore), the
whole-file diff expansion path, the changed-files browser, blame-to-line author
colouring, and character-span wrapping inside rendered Markdown — including the
compact partial-line grouping shown by the README
example `H[-i there,-][+ello World!+]` — are all implemented. Remaining work is
incremental polish (for example, surfacing two-file comparison in the UI and a
richer ref picker) rather than missing pipeline stages.

## Goals recap

markdiff is intended to render git diffs of Markdown notes as **rendered
Markdown**, with:

- comparison of any two versions of a note, or two different files;
- **character-level** diffs highlighted *inside* the rendered rich text;
- compact partial-line edits that keep unchanged text readable while showing
  removed and added text inline at the edit point;
- focused changed-hunk review and whole-file review that includes unchanged
  lines outside git's hunk context;
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
| `@types/node` | `^22.15.17` | Node typings (for `path` in `git/repo.ts`, `process` in `esbuild.config.mjs`) |
| `eslint` + `@eslint/js` + `typescript-eslint` | `^9.39.4` / `^9.39.4` / `^8.59.1` | Lint (flat config) |
| `eslint-plugin-obsidianmd` | `^0.3.0` | Obsidian submission-readiness rules |
| `globals`, `jiti` | `^17.6.0`, `^2.6.1` | ESLint flat-config support |
| `vitest` | — | Unit-test runner for the pure diff logic |

`esbuild.config.mjs` writes the bundle to `main.js` at the repository root. The
`version` npm script runs `version-bump.mjs` to keep `manifest.json` and
`versions.json` in sync on release. The manual install flow copies `main.js`,
`manifest.json`, and `styles.css` into the vault plugin directory.

`package.json` runs `tsc -noEmit` before the production bundle. `tsconfig.json`
sets `skipLibCheck` so external Obsidian API typings do not block source
type-checking.

Unit tests (`npm test`) cover the pure, Obsidian-independent logic under
`tests/`: diff parsing, character segmentation, whole-file expansion, blame
parsing, the git ref/path/env security guards, the author colour helper, the
code-fence detector, and the repo→vault path mapper. `npm run test:coverage`
enforces an 80% line/branch/function/statement gate over that unit-testable
surface (`diff/`, `lib/`, `git/security.ts`). The Obsidian/DOM-coupled view
and render layers and the `simple-git` subprocess wrapper require the app host
or a live git repo, so they are exercised manually in-app rather than gated by
unit coverage.

## Target architecture & data flow

The source tree is shaped around this pipeline, and `src/main.ts` wires it end
to end: **Toggle diff mode** opens the inline diff view for the active note, and
**Browse changed Markdown files** opens the changed-files browser.

```
active note ──▶ Repo.forFile()            (git/repo.ts)
                  │  resolve repo root, bind simple-git
                  ▼
            Repo.diffRefs() / diffFiles()  ── unified diff string
                  │
                  ▼
            parseUnifiedDiff()             (diff/parse.ts)
                  │  parsePatch → hunks of add/del/context lines
                  │  pairChanges → pair del/add runs + granular segments
                  │  optional whole-file expansion from working-copy text
                  ▼
            FileDiff[] (diff/types.ts)     one entry per changed file
                  │  + per-line author from Repo.blamePorcelain()
                  │    (diff/blame.ts, when "Colour by author" is on)
                  ▼
            renderFileDiff()               (render/renderDiff.ts)
                  │  called once per FileDiff
                  │  MarkdownRenderer.render() per line
                  │  compact split on rendered text → wrap changed runs
                  │    in .markdiff-del / .markdiff-add spans
                  │  per-author colour via colorForAuthor()
                  ▼
            inline in the diff view (workspace leaf)
```

`renderFileDiff()` runs once per `FileDiff`, rendering each diff line through
`MarkdownRenderer.render()` and applying a per-author colour via
`colorForAuthor()` when a line's `author` is set. For a paired delete/add line it
computes the compact common-prefix/suffix split (`splitCommon`) against the
*rendered* text and wraps the changed runs in `.markdiff-del` / `.markdiff-add`
spans. Diffing the rendered text — rather than the raw segments attached by the
parser — is what lets the highlight land inside rendered headings, bold, links,
and code spans, where markdown syntax characters no longer occupy the same
offsets as the source.

`parseUnifiedDiff()` returns one `FileDiff` per changed file. `pairChanges`
pairs each maximal run of deletions with the following run of additions and
attaches granular `diffChars` segments to each pair; uneven runs leave the
leftover lines standalone. Those segments are the structured model and the
signal that a del/add pair is a partial-line edit — the renderer recomputes the
compact split on rendered text for the actual highlight placement.

The diff view defaults to **Changed hunks**, which renders the parsed git hunks
exactly as git emitted them. In **Whole file** mode, `expandDiffToWholeFile()`
reads the working-copy note, fills every gap between hunks with dimmed context
lines, and keeps deleted lines anchored at their original positions. This makes
the rendered output a complete-file review while preserving the same
`FileDiff`/`DiffLine` model used by the focused hunk view.

### Partial-line edit target

The README uses `Hi there,` → `Hello World!` to show the intended compact
partial-line treatment:

```
H[-i there,-][+ello World!+]
```

This display keeps the unchanged prefix visible, strikes through removed text,
and inserts added text at the same edit point. jsdiff's `diffChars` would keep
interior matching characters as separate unchanged segments (for the README
example it keeps `H`, `e`, and `r`), which is why the renderer instead uses
`splitCommon`: it collapses everything between the common prefix and suffix into
a single removed run and a single added run, producing the compact form above.
The split runs on the rendered text and is surrogate-pair aware, so astral
characters (emoji, some CJK) are never cut mid-glyph.

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

All guardrails below are implemented in `git/repo.ts` (with `settings.ts` and
`manifest.json` for the platform pieces).

- **Discrete git arguments:** diff, blame, show, and restore commands pass refs
  and paths as array elements rather than shell strings. Pathspec-style commands
  put `--` before file paths.
- **Ref and path validation:** `assertSafeRef()` rejects empty refs, refs that
  start with `-` (option injection), and anything outside the revision grammar;
  `assertSafePath()` guards the `ref:path` revision used by `showAtRef()` (which
  has no `--` separator). Both run inside `diffRefs()`, `showAtRef()`,
  `blamePorcelain()`, and `restore()`.
- **Confined `--no-index`:** `Repo.diffFiles()` `realpath`-confines both inputs
  under a caller-supplied directory (the vault root) and rejects paths that
  escape it.
- **Markdown-only changed files:** `Repo.changedMarkdownFiles()` filters git
  status to `.md`/`.markdown`; the changed-files browser uses it.
- **Malicious-repo hardening:** `Repo.forFile()` / `forDir()` set `diff.external=`
  and `core.pager=cat` via config, pass `--no-textconv` on diff/show/blame, and
  spawn git with a hardened environment that *removes* `GIT_EXTERNAL_DIFF`,
  `GIT_SSH`, `GIT_SSH_COMMAND`, and `GIT_SSH_VARIANT` (setting them to empty
  would make git try to exec an empty command) while forcing `GIT_PAGER=cat` and
  `GIT_TERMINAL_PROMPT=0`.
- **macOS Electron PATH setting:** `settings.ts` exposes an optional git binary
  path for GUI-launched Obsidian sessions that do not inherit the shell `$PATH`.
- **Desktop-only manifest:** `manifest.json` sets `isDesktopOnly: true`, because
  native git access is unavailable on Obsidian mobile.

One follow-up remains before surfacing file-to-file comparison in the UI:
`Repo.diffFiles()` is confinement-ready, but no command wires it up yet.

## Source layout

```
src/
├── main.ts              plugin entry — commands, ribbon, view + settings wiring
├── settings.ts          settings model + parser + settings tab
├── git/
│   ├── repo.ts          simple-git wrapper (subprocess I/O; integration-tested)
│   └── security.ts      ref/path validation + env hardening (pure, unit-tested)
├── diff/
│   ├── types.ts         FileDiff / DiffHunk / DiffLine / TextSegment
│   ├── segments.ts      granular diffChars segments + compact prefix/suffix split
│   ├── parse.ts         unified-diff parsing + del/add run pairing
│   ├── wholeFile.ts     expand parsed hunks into whole-file context
│   ├── blame.ts         --line-porcelain parsing + per-line author attach
│   └── pipeline.ts      orchestrate parse → expand → blame into one FileDiff load
├── render/
│   └── renderDiff.ts    render FileDiff lines + inline char spans
├── lib/
│   ├── util.ts          shared helpers (errorMessage, isRecord)
│   ├── color.ts         deterministic per-author colour
│   ├── fence.ts         code-fence detection (pure, unit-tested)
│   └── path.ts          repo→vault path mapping (pure, unit-tested)
├── view/
│   └── DiffView.ts      inline diff view: banner, ref picker, nav, restore
└── ui/
    └── ChangedFilesModal.ts  changed Markdown files browser
```

