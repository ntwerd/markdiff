# markdiff

> Development scaffold for viewing git diffs of Markdown files as **rendered
> Markdown** instead of raw `+`/`-` source.

[Obsidian](https://obsidian.md) desktop plugin scaffold. The goal is to make
Markdown diffs readable by parsing git diffs and rendering added and removed
content through Obsidian's Markdown renderer, so you can review real headings,
bold, tables, lists, and code blocks.

The repository currently includes the settings tab, command registration, git
wrapper, unified-diff parser, and initial renderer. The interactive Obsidian UI
is not complete yet: **Toggle diff mode** and **Browse changed Markdown files**
are registered, but their command handlers still throw `Not implemented`.

The example below shows the target reading experience for a partial-line edit.
The raw git diff changes `Hi there,` to `Hello World!`. markdiff keeps the
shared `H`, marks `i there,` as removed, and inserts `ello World!` at the same
position.

```
Raw git diff
- Hi there,
+ Hello World!

Target partial-line rendering
H[-i there,-][+ello World!+]
```

## Target character diffs in rich text

markdiff is designed to highlight tiny edits inside the rendered Markdown
output. That means you review the changed letters inside headings, bold text,
links, tables, and code spans instead of reading raw Markdown syntax.

In the examples, `[+added+]` means green added text, and `[-removed-]` means red
strikethrough deleted text. These markers explain the intended styling; they are
not literal text that appears in Obsidian. In the partial-line example above,
the leading `H` stays unstyled because it is unchanged.

| Markdown change | Rich text display |
| --- | --- |
| `**pubic**` → `**public**` | rendered bold word: **pub[+l+]ic** |
| `## API limites` → `## API limits` | rendered heading text: API limit[-e-]s |
| `[account seting](settings.md)` → `[account setting](settings.md)` | rendered link label: account set[+t+]ing |
| `` `git dif` `` → `` `git diff` `` | rendered code span: `git dif[+f+]` |
| `drafft` in a table cell → `draft` | rendered table text: draf[-f-]t |

## Current status

Implemented foundation:

- Git repository discovery and diff helpers through `simple-git`.
- Unified-diff parsing and character-level refinement through `diff`.
- Settings for the default base ref, author colors, and git binary path.
- Command and ribbon registration in Obsidian.
- Initial rendered Markdown output for parsed diff lines.

Planned product behavior:

- Rendered diffs shown as live Markdown, not raw source text.
- Character-level highlights inside rendered Markdown.
- Comparison of any two refs, or two Markdown files.
- Inline diff mode in the active note.
- A changed-files browser for Markdown files in the vault.
- Navigation between changes.
- Restore of a selected version.
- Color coding by change type and commit author.

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

The plugin can be loaded for development, but the user-facing commands are not
usable yet. Running **markdiff: Toggle diff mode** or **markdiff: Browse changed
Markdown files** currently throws `Not implemented`.

The target workflow is:

1. Open a Markdown note that has uncommitted or committed changes.
2. Run **markdiff: Toggle diff mode** or click the ribbon icon.
3. Choose the two sides to compare, such as `HEAD` against the working copy, two
   refs, or two Markdown files.
4. Review formatted Markdown changes inline in the active note.
5. Navigate between changes or restore a selected version.
6. Exit diff mode to restore the normal note view.

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

The implemented foundation follows this flow:

1. `Repo.forFile()` finds the git repository root for a file.
2. `Repo.diffRefs()` runs `git diff <ref-a> <ref-b> -- <path>`, or
   `Repo.diffFiles()` runs `git diff --no-index -- <file-a> <file-b>`.
3. `parseUnifiedDiff()` parses the unified diff into added, removed, and
   unchanged lines, then refines paired add/delete lines into character
   segments.
4. `renderFileDiff()` renders each diff line through Obsidian's
   `MarkdownRenderer`.

The remaining work is to wire that pipeline into the active note view, wrap
character segments inside the rendered DOM, map blame output into per-line
authors, implement navigation, and implement restore from the UI.

## License

MIT, as declared in `package.json`.
