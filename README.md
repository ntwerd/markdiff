# markdiff

> View git diffs of Markdown files as **rendered Markdown** instead of raw
> `+`/`-` source.

[Obsidian](https://obsidian.md) desktop plugin. It makes Markdown diffs readable
by parsing git diffs and rendering added and removed content through Obsidian's
Markdown renderer, so you can review real headings, bold, tables, lists, and
code blocks.

markdiff is functional: **Toggle diff mode** opens an inline diff view for the
active note — rendered Markdown with character-level highlights, change
navigation, per-author colouring, and one-click restore — and **Browse changed
Markdown files** lists the vault's changed notes and opens any of them in the
diff view.

The example below shows how markdiff renders a partial-line edit. The raw git
diff changes `Hi there,` to `Hello World!`; in the diff view the unchanged prefix
stays readable, the removed text is struck through, and the added text appears
inline at the edit point.

```
Raw git diff
- Hi there,
+ Hello World!

How markdiff renders it
H[-i there,-][+ello World!+]
```

The renderer wraps the changed characters in styled spans inside the rendered
Markdown; the `[- -]` / `[+ +]` markers above just denote the red/green styling
and are not literal text.

## Character diffs in rich text

markdiff highlights tiny edits inside the rendered Markdown
output. That means you review the changed letters inside headings, bold text,
links, tables, and code spans instead of reading raw Markdown syntax.

In the examples, `[+added+]` means green added text, and `[-removed-]` means red
strikethrough deleted text. These markers explain the intended styling; they are
not literal text that appears in Obsidian. In the partial-line example above,
the leading `H` stays unstyled in the intended compact view because it is
unchanged.

| Markdown change | Rich text display |
| --- | --- |
| `**pubic**` → `**public**` | rendered bold word: **pub[+l+]ic** |
| `## API limites` → `## API limits` | rendered heading text: API limit[-e-]s |
| `[account seting](settings.md)` → `[account setting](settings.md)` | rendered link label: account set[+t+]ing |
| `` `git dif` `` → `` `git diff` `` | rendered code span: `git dif[+f+]` |
| `drafft` in a table cell → `draft` | rendered table text: draf[-f-]t |

## Current status

Implemented:

- Git repository discovery, diff, blame, show, and restore through `simple-git`,
  with ref/path validation and malicious-repo hardening.
- Unified-diff parsing with multi-line del/add pairing and character refinement.
- Rendered Markdown diffs with character-level highlights inside the rendered
  text (headings, bold, links, tables, code spans).
- Compact partial-line grouping at the edit point.
- Inline diff view with a compare-ref banner, change navigation, and restore.
- A changed-files browser for the vault's changed Markdown notes.
- Colour coding by change type and by commit author (via `git blame`).
- Settings for the default base ref, author colouring, and git binary path.

Planned / not yet surfaced:

- File-to-file comparison in the UI (the `git diff --no-index` path exists and is
  vault-confined, but no command exposes it yet).
- A richer ref picker beyond the default base ref and recent `HEAD~n` options.

## Requirements

- [Obsidian](https://obsidian.md) **1.5.0** or newer, matching
  `manifest.json` (desktop only; see below).
- `git` installed and available on your `PATH`.
- Your Obsidian vault (or a parent directory) must be a git repository.

> markdiff shells out to the system `git` binary, so it runs on **desktop only** (macOS, Windows, Linux). It is not available on Obsidian mobile.

## Installation

### From Obsidian

markdiff is not published as a community plugin yet.

### Manual build (for now)

```bash
git clone https://github.com/<owner>/markdiff.git
cd markdiff
npm install
npm run build
```

Then copy the build output into your vault:

```bash
mkdir -p "<your-vault>/.obsidian/plugins/markdiff"
cp main.js manifest.json styles.css \
   "<your-vault>/.obsidian/plugins/markdiff/"
```

Restart Obsidian or reload plugins, then enable **markdiff** under
**Settings** → **Community plugins**.

## Usage

1. Open a Markdown note that has uncommitted or committed changes.
2. Run **markdiff: Toggle diff mode** or click the ribbon icon. A diff view opens
   in a new tab.
3. In the compare banner, pick the base ref to compare against the working copy
   (defaults to your configured base ref).
4. Review the formatted Markdown changes, with removed and added text highlighted
   inline at each edit point.
5. Use the banner's up/down buttons to jump between changes, or **Restore** to
   roll the file back to the selected ref (click twice to confirm).
6. Run **markdiff: Browse changed Markdown files** to see every changed note in
   the vault and open any of them in the diff view.
7. Close the diff tab (or toggle the command again) to exit diff mode.

Tip: bind the commands to hotkeys under **Settings → Hotkeys**.

For implementation details and current TODOs, see
[tech stack and architecture](./docs/tech-stack.md).

## Development

```bash
npm install      # install dependencies
npm run dev      # esbuild watch; rebuilds main.js on every save
npm run build    # type-check + production bundle
npm run lint     # ESLint
```

For a fast dev loop, symlink `main.js` into
`<vault>/.obsidian/plugins/markdiff/main.js`, and install the **Hot-Reload**
community plugin to reload on save.

See [tech stack and architecture](./docs/tech-stack.md) for the full
architecture, data flow, and conventions.

## How it works

1. `Repo.forFile()` finds the git repository root for a file.
2. `Repo.diffRefs()` runs `git diff --no-textconv <ref> -- <path>` against the
   working tree (`Repo.diffFiles()` runs a vault-confined `git diff --no-index`).
3. `parseUnifiedDiff()` parses the unified diff into added, removed, and
   unchanged lines and pairs delete/add runs into character segments.
4. When colour-by-author is on, `git blame --line-porcelain` is parsed and
   mapped onto each line.
5. `renderFileDiff()` renders each line through Obsidian's `MarkdownRenderer` and
   wraps the changed characters in styled spans inside the rendered DOM.

`DiffView` hosts that pipeline in a workspace leaf with the compare banner,
change navigation, and restore; `ChangedFilesModal` lists the changed notes.

## License

MIT, as declared in `package.json`.
