# markdiff

> View git diffs of Markdown files as **rendered Markdown** — not raw `+`/`-` source.

[Obsidian](https://obsidian.md) plugin. When you change a note and want to see what actually changed, a normal `git diff` buries the content under Markdown syntax. **markdiff** parses the diff and renders the added and removed content through Obsidian's Markdown renderer, so you read real headings, bold, tables, lists, and code blocks — color-coded by what was added or removed.

```
Raw git diff                  →  markdiff
────────────────────────────     ────────────────────────────────
- ## Roadmap                     Roadmap (rendered h2, struck through)
+ # Roadmap                      Roadmap (rendered h1, added)
+                                blank added line
- Now with **data**.             Now with dat[-a-]. (inside bold)
+ Now with **date**.             Now with dat[+e+]. (inside bold)
```

## Character diffs in rich text

markdiff highlights tiny edits inside the rendered Markdown output. That means
you review the changed letters inside headings, bold text, links, tables, and
code spans instead of reading raw Markdown syntax.

The examples below use `[+added+]` and `[-removed-]` markers to show where the
UI applies green additions and red strikethrough deletions. The markers are not
shown as literal text in Obsidian.

| Markdown change | Rich text display |
| --- | --- |
| `**pubic**` → `**public**` | rendered bold word: **pub[+l+]ic** |
| `## API limites` → `## API limits` | rendered heading text: API limit[-e-]s |
| `[account seting](settings.md)` → `[account setting](settings.md)` | rendered link label: account set[+t+]ing |
| `` `git dif` `` → `` `git diff` `` | rendered code span: `git dif[+f+]` |
| `drafft` in a table cell → `draft` | rendered table text: draf[-f-]t |

## Features

- 📝 **Rendered diffs** — additions and deletions shown as live Markdown, not raw source text.
- 🔤 **Character-level diffs on rich text** — small edits are highlighted *inside* the rendered Markdown, so a typo fix lights up only the changed characters — not the whole line or paragraph.
- 🔀 **Compare any two versions** — pick any two points in a note's history (branch, tag, commit, or `HEAD`) and see exactly what changed between them.
- 📑 **Compare two files** — diff two different Markdown notes against each other, not just two versions of the same one.
- ✍️ **Inline, block, and formatting changes** — detects insertions, deletions, and edits within a paragraph; block-level changes (added/removed headings, list items, paragraphs, tables, code blocks); and changes to formatting and structure (bold/italic/code, heading levels, list types) — not just plain text.
- 👤 **Color-coded by author** — see *who* changed what, with a distinct color per author derived from the note's commit history.
- 🎨 **Color-coded by change type** — green additions, red strikethrough deletions, dimmed unchanged context; all colors customizable via CSS.
- 🧭 **Navigate between changes** — step from one change to the next to review every edit in a note.
- ↩️ **Restore a version** — roll the note back to an earlier version straight from the diff.
- 📂 **Inline diff mode** — toggle a rendered diff right inside the active note; exit to return to normal editing.
- 🗂️ **Diff list** — browse all changed Markdown files in your vault and open each.
- ⚡ **Live with your repo** — reads the real `git` history of your vault.

## Requirements

- [Obsidian](https://obsidian.md) **1.5.7** or newer (desktop only — see below).
- `git` installed and available on your `PATH`.
- Your Obsidian vault (or a parent directory) must be a git repository.

> markdiff shells out to the system `git` binary, so it runs on **desktop only** (macOS, Windows, Linux). It is not available on Obsidian mobile.

## Installation

### From Obsidian (once published)

1. Settings → **Community plugins** → turn off **Safe mode** (if shown).
2. **Browse** → search for **markdiff** → **Install** → **Enable**.

### Manual build (for now)

```bash
git clone https://github.com/<owner>/markdiff.git
cd markdiff
npm install
npm run build
```

Then copy the build output into your vault:

```bash
cp dist/main.js manifest.json styles.css \
   "<your-vault>/.obsidian/plugins/markdiff/"
```

Restart Obsidian (or reload), then **Settings → Community plugins → enable markdiff**.

## Usage

1. Open a Markdown note that has uncommitted or committed changes.
2. Run the **markdiff: Toggle diff mode** command (or click the ribbon icon).
3. The note's rendered content is replaced **inline** by the rendered diff, with a small banner to pick the two sides to compare — either two versions of the same note (defaults to `HEAD` vs. the working copy; choose any branch, tag, or commit on either side) or two different Markdown files.
4. Read the changes as formatted Markdown — color-coded by change type, and optionally by author. Use the **next / previous change** controls to step through each edit.
5. **Restore** an earlier version from the banner to roll the note back to that point.
6. Run **markdiff: Toggle diff mode** again (or click **Exit** in the banner) to restore the normal note.
7. Use **markdiff: Browse changed Markdown files** to list every changed note; selecting one opens it and enters diff mode inline.

Tip: bind the commands to hotkeys under **Settings → Hotkeys**.

For complete installation, setup, usage, settings, and troubleshooting
instructions, see the [markdiff user manual](./docs/user-manual.md).

## Development

```bash
npm install      # install dependencies
npm run dev      # esbuild watch — rebuilds dist/ on every save
npm run build    # type-check + production bundle
npm run lint     # ESLint
```

For a fast dev loop, point esbuild's output directly at your test vault's plugin folder (or symlink `dist/main.js` into `<vault>/.obsidian/plugins/markdiff/main.js`) and install the **Hot-Reload** community plugin to reload on save.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, data flow, and conventions.

## How it works

1. markdiff finds the git repository root for the active file (the vault is not always the repo root).
2. It runs `git diff <ref-a> <ref-b> -- <path>` via the `git` CLI to get a unified diff between the two chosen versions — or `git diff --no-index <file-a> <file-b>` when comparing two different files.
3. The diff is parsed into added, removed, and unchanged regions, then refined to **character-level** changes within each line, with each change attributed to its author via the note's commit history.
4. The content is rendered through Obsidian's Markdown renderer and drawn **inline in the active note's view** (replacing the normal rendered note while diff mode is on), with the character-level changes highlighted *inside* the rich text and tagged by change type and author — giving you real, formatted Markdown instead of raw diff text.
5. Restoring a version checks the chosen content back out into the working copy through the `git` CLI.

## License

[MIT](./LICENSE)
