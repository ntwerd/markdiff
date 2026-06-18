# markdiff — user manual

markdiff is an [Obsidian](https://obsidian.md) plugin that turns `git diff`
output of Markdown notes into **rendered Markdown**, with character-level
highlights, colour coding by author, and change navigation. Instead of
reading `+`/`-` source lines, you read the same content the note shows in
reading view — with the actual changes styled inline.

This manual covers installation, configuration, day-to-day usage, and
troubleshooting. For implementation details, see
[tech stack and architecture](./tech-stack.md).

---

## 1. What markdiff does

- Opens a **rendered Markdown diff** for the active note in a new tab.
- Renders added and removed text through Obsidian's Markdown renderer, so
  headings, bold, links, tables, and code spans keep their formatting.
- Highlights changes **at the character level inside the rendered text** —
  you see the actual letters that changed, not raw `+`/`-` lines.
- Colours each change by type (added/removed) and optionally by commit
  author (via `git blame`).
- Lets you **jump between changes** with up/down buttons.
- Lets you **restore the working copy** to a chosen ref with a single click.
- Provides a **changed-files browser** that lists every Markdown note in
  the vault that has uncommitted or committed changes.

---

## 2. Requirements

| Requirement | Details |
| --- | --- |
| Obsidian | **1.5.0** or newer (desktop only). Mobile is not supported. |
| `git` | Installed and runnable. markdiff shells out to the system git binary. |
| Vault location | Your vault (or one of its parents) must be inside a git working tree. |

### Verify git is available

In a terminal:

```bash
git --version
```

You should see something like `git version 2.x.y`. If the command is not
found, install git first:

- **macOS**: `brew install git` (Homebrew), or `xcode-select --install`
  for the Apple Command Line Tools version.
- **Windows**: install [Git for Windows](https://gitforwindows.org/).
- **Linux**: install via your package manager (`apt install git`,
  `dnf install git`, etc.).

### Verify your vault is a git repository

In a terminal, change into your vault directory and run:

```bash
git status
```

If you see `not a git repository` (or similar), initialise one:

```bash
git init
git add .
git commit -m "Initial import"
```

If your vault is **inside** another git repository (for example a monorepo
or a parent folder that is the actual repo), markdiff will use the parent
repo automatically. You do not need to make the vault root the repo root.

---

## 3. Installation

markdiff is not yet published to Obsidian's community plugin gallery. For
now, install it manually from source.

### 3.1. Build the plugin

Clone the repository and install its dependencies:

```bash
git clone https://github.com/<owner>/markdiff.git
cd markdiff
npm install
npm run build
```

`npm run build` runs the TypeScript type-checker and produces a production
bundle at `main.js` in the project root.

### 3.2. Copy the build into your vault

Each Obsidian plugin lives in a folder named after its `id` (here,
`markdiff`) inside the vault's `.obsidian/plugins/` directory.

```bash
# macOS / Linux (PowerShell users: see below)
VAULT="$HOME/Documents/MyVault"
mkdir -p "$VAULT/.obsidian/plugins/markdiff"
cp main.js manifest.json styles.css \
   "$VAULT/.obsidian/plugins/markdiff/"
```

**Windows PowerShell:**

```powershell
$Vault = "$env:USERPROFILE\Documents\MyVault"
New-Item -ItemType Directory -Force -Path "$Vault\.obsidian\plugins\markdiff"
Copy-Item main.js, manifest.json, styles.css `
          -Destination "$Vault\.obsidian\plugins\markdiff"
```

The vault must contain exactly these three files in
`.obsidian/plugins/markdiff/`:

- `main.js`
- `manifest.json`
- `styles.css`

### 3.3. Enable the plugin in Obsidian

1. Open the vault in Obsidian.
2. Go to **Settings → Community plugins**.
3. If community plugins are disabled, click **Turn on community plugins**.
4. In the list of installed plugins, find **markdiff** and toggle it on.
5. If Obsidian asks to reload plugins, accept.

If you do not see markdiff in the list, double-check the three files are
present in the right folder and that you copied the freshly built
`main.js` (not an old one).

### 3.4. Optional: a faster dev loop

If you intend to make changes to the plugin code, use the hot-reload
workflow:

```bash
npm run dev    # esbuild watch mode; rebuilds main.js on every save
```

Symlink the live `main.js` into your vault so rebuilds are picked up
without copying:

```bash
ln -s "$(pwd)/main.js" "$VAULT/.obsidian/plugins/markdiff/main.js"
```

Install the [Hot-Reload](https://github.com/pjeby/hot-reload) community
plugin in Obsidian to reload the plugin automatically when `main.js`
changes.

---

## 4. Configuration

Open **Settings → Community plugins → markdiff** to configure three
options. All settings are saved per-vault.

### 4.1. Default base ref

The ref that the working copy is compared against when a diff is opened.
Defaults to `HEAD` (i.e. the last commit).

- Use `HEAD` to see **uncommitted** working-copy changes against the
  latest commit.
- Use `HEAD~1` to see the last commit's changes on top of the previous
  one.
- Use a branch or tag name (e.g. `main`, `release-2026-06`) to compare
  against a specific point in history.

The compare banner in the diff view also offers `HEAD` and `HEAD~1` /
`HEAD~3` as quick picks. You can switch base ref at any time while a
diff is open.

### 4.2. Colour-code by author

When on, each line is annotated with the author of the last commit that
touched it, using `git blame --line-porcelain`. The change element gets a
small coloured bar on the left edge that identifies the author. When
off, only the type-based colour (green for added, red for removed) is
shown.

This is on by default. Turn it off if you find the bars noisy, or if
`git blame` is slow on your repo.

### 4.3. Git binary path

Leave blank to use whichever `git` is found on `PATH`. Set this to an
absolute path if Obsidian cannot find git — most commonly on **macOS**,
where Obsidian launched from the GUI does not inherit the shell `PATH`
and therefore cannot find Homebrew git at `/opt/homebrew/bin/git`.

Common values:

- `/opt/homebrew/bin/git` (Apple-silicon Homebrew)
- `/usr/local/bin/git` (Intel Homebrew)
- `/usr/bin/git` (Xcode Command Line Tools)
- `C:\Program Files\Git\bin\git.exe` (Windows default Git for Windows)

---

## 5. Usage

### 5.1. Open a diff for the active note

You can invoke the **Toggle diff mode** command in three ways:

1. The ribbon icon in the left sidebar (a git-compare icon).
2. The command palette: `Ctrl/Cmd + P` → **markdiff: Toggle diff mode**.
3. A custom hotkey — bind one under **Settings → Hotkeys**, search for
   "markdiff", and assign it to whatever key combo you like.

If the active tab is a Markdown note, a new tab opens showing its diff.
If a diff for the same file is already open, it is brought into focus
(or, if you invoke the command again from the diff tab itself, the
diff is closed — that is the "toggle" behaviour).

If no Markdown note is open, a notice appears: *"Markdiff: open a
Markdown note first."*

### 5.2. Read the compare banner

At the top of the diff view you will see:

- The vault-relative path of the file.
- A dropdown to pick the base ref (`HEAD`, `HEAD~1`, `HEAD~3`, or your
  custom default). Changes are recomputed when you change the ref.
- A display dropdown. **Changed hunks** shows git's changed regions and nearby
  context; **Whole file** includes every unchanged line in the working-copy note.
- A **Restore \<ref\>** button. See [section 5.5](#55-restore-a-file).
- Up / down arrow buttons to navigate between changes. See
  [section 5.4](#54-navigate-between-changes).

In addition to the banner dropdown, a **toggle button** sits in the diff
view's header (top-right, next to where Obsidian's edit/read-mode toggle
appears). Click it to switch between **Changed hunks** and **Whole file**
without opening the dropdown. The icon reflects the current mode: a list
icon for changed hunks, a file icon for whole file.

### 5.3. Understand the highlighting

markdiff tries to be unobtrusive while making changes obvious.

| What you see | Meaning |
| --- | --- |
| Green background on a line | The whole line is added. |
| Red background, strikethrough text | The whole line is removed. |
| Strikethrough text on a line (red) | Inline removed text — the rest of the line is unchanged. |
| Highlighted text on a line (green) | Inline added text — the rest of the line is unchanged. |
| Dimmed text | Unchanged context. In Whole file mode, this includes unchanged lines outside git's changed hunks. |
| Coloured bar on the left edge | The author of the last commit that touched this line (only when "Colour-code by author" is on). |
| Blue outline | The change you are currently navigated to. |

Character-level highlights are applied **inside** the rendered Markdown.
That means a one-letter typo in a heading shows up as a single green
character inside the heading text — not as a separate "before/after"
block.

#### Worked example

Suppose you have a heading in your note:

```markdown
## API limites
```

and you change `limites` to `limits`. In the diff view the heading is
still rendered as a heading, and the single removed letter `e` is shown
struck through inside the rendered heading text:

```
## API limit[-e-]s
```

(The `[- -]` markers above are illustrative. In Obsidian you see
strikethrough on the `e`, with a red background and a red strikethrough
line. The surrounding text is unchanged.)

### 5.4. Navigate between changes

Each contiguous change (block or inline) is a single "change". The
up/down arrow buttons in the banner step through them in order:

- The current change gets a blue outline.
- It scrolls into the centre of the view automatically.
- The selection wraps around: pressing down on the last change jumps
  back to the first.

If the file has no changes against the selected ref, a message in the
body says *"No changes between \<ref\> and the working tree."* and the
up/down buttons are effectively no-ops (with a notice if pressed).

### 5.5. Restore a file

The **Restore \<ref\>** button in the banner overwrites the working copy
of the note with the contents at the selected ref. This is destructive —
any uncommitted changes you have made to that file will be lost.

To prevent accidental clicks, restore is a two-step action:

1. Click **Restore \<ref\>** once. The button label changes to
   *"Click again to confirm"* and gets a warning colour. A four-second
   timer starts.
2. Click again within four seconds to confirm. The button resets to its
   original label and the file is restored.

If the timer expires, the button resets and you must click it again to
start a fresh confirmation.

A notice confirms the restore on success, or surfaces the git error on
failure.

### 5.6. Browse every changed Markdown file

Run **markdiff: Browse changed Markdown files** (command palette or a
hotkey) to open a modal that lists every Markdown file in the vault
that has changes against the default base ref.

- Each entry shows the vault-relative path of the file.
- Click the **Diff** button on any row to close the modal and open the
  diff view for that file in a new tab.
- If there are no changes, the modal says *"No changed Markdown files."*
- If the vault is not inside a git repository, the modal says
  *"Vault is not inside a Git repository."*

The list is built from `git status` and filtered to files ending in
`.md` or `.markdown` that live inside the vault.

### 5.7. Exit diff mode

Close the diff tab the same way you close any other tab (the `x` on the
tab, or **Ctrl/Cmd + W**). Alternatively, run **markdiff: Toggle diff
mode** again from the diff tab itself — the toggle command closes the
diff leaf when invoked on a file that already has a diff open.

---

## 6. Tips and workflows

### 6.1. Reviewing uncommitted edits

Leave the default base ref set to `HEAD` and use the ribbon icon. The
diff view shows your working-copy edits against the last commit in
rendered Markdown. Use **Changed hunks** for a focused review, or switch
to **Whole file** when you want the unchanged parts of the note shown as
dimmed context.

### 6.2. Reviewing a specific commit

Set the base ref to `HEAD~1` to see the most recent commit's changes on
top of the previous one. You can use `HEAD~2`, `HEAD~5`, etc., to
review several commits at once.

### 6.3. Comparing against a branch

Type the branch name in **Settings → Community plugins → markdiff →
Default base ref**. The compare banner will still offer the same quick
picks; the diff itself uses whatever ref you set.

### 6.4. Hotkeys

Open **Settings → Hotkeys** and search for `markdiff`. The two commands
to bind are:

- **markdiff: Toggle diff mode**
- **markdiff: Browse changed Markdown files**

Common choices:

- `Ctrl/Cmd + Shift + D` for toggle diff
- `Ctrl/Cmd + Shift + G` for browse changed files

### 6.5. Customising the colours

The diff colours are exposed as CSS custom properties. To override them
per-vault, create a CSS snippet (or edit your theme) and add:

```css
.markdiff-view {
  --markdiff-add-bg:   color-mix(in oklch, var(--color-green) 22%, transparent);
  --markdiff-add-text: var(--color-green);
  --markdiff-del-bg:   color-mix(in oklch, var(--color-red)   20%, transparent);
  --markdiff-del-text: var(--color-red);
  --markdiff-context-opacity: 0.45;
}
```

Save it as a `.css` file under `<vault>/.obsidian/snippets/` and enable
it from **Settings → Appearance → CSS snippets**.

---

## 7. Troubleshooting

### "Markdiff requires a local (desktop) vault."

You are running Obsidian on a platform that does not use the
`FileSystemAdapter` (typically mobile, or some iCloud-only vaults).
markdiff is desktop-only and needs a real local filesystem path.

### "This file is not inside a Git repository."

markdiff looks for a `.git` directory at the file's location, or in any
parent directory. If your vault is not a git repo, initialise one
(`git init && git add . && git commit -m "Initial import"`) or place the
vault inside an existing repo.

### "Markdiff requires a local (desktop) vault." / git not found

The plugin cannot find `git`. On **macOS**, the most common cause is
that Obsidian launched from the Dock/Finder does not inherit the shell
`PATH`, so Homebrew git at `/opt/homebrew/bin/git` is invisible.

Fix by setting **Settings → Community plugins → markdiff → Git binary
path** to the absolute path of your git binary. See [section 4.3](#43-git-binary-path).

To find your git binary, run `which git` in a terminal.

### "No changes between \<ref\> and the working tree."

The selected base ref matches the working copy exactly. Either pick a
different ref (e.g. `HEAD~1`) or make some changes and re-open the
diff. Note that `git status` and the diff view are not always the same:
`git status` reports *uncommitted* changes, while the diff view compares
the working copy against the chosen ref, which may include *committed*
changes between refs.

### "Vault is not inside a Git repository."

The **Browse changed Markdown files** command could not find a git
working tree at the vault root or any of its parents. Initialise a repo
at or above the vault root.

### Restore fails

Restore calls `git checkout <ref> -- <path>` (and a ref/log
configuration that suppresses diff external). Most failures mean:

- The ref does not exist. Pick a different one.
- There are uncommitted changes in the file that conflict with the
  checkout. The notice will contain the underlying git error.
- Permissions: Obsidian does not have write access to the file.

### Diff seems to lag on large repos

`git blame --line-porcelain` runs once per diff when "Colour-code by
author" is on. On a large file, this can take a second or two. Turn the
setting off if you prefer instant diffs at the cost of losing the
author colour.

### Changes are wrong or missing

markdiff parses `git diff --no-textconv <ref> -- <path>`. It does not
follow textconv filters or external diff drivers. If your repo has
those configured, markdiff will see the raw file content, not the
filtered version.

---

## 8. Limitations

- **Desktop only.** markdiff shells out to the system `git` binary,
  which is not available on Obsidian mobile.
- **Markdown only.** The changed-files browser filters to `.md` /
  `.markdown`. The diff view itself will still render any file Obsidian
  can render, but you have to open it explicitly by path.
- **No file-to-file comparison UI.** The git wrapper supports
  `git diff --no-index`, but no command wires it up yet. For now,
  compare against a ref.
- **No interactive ref picker beyond quick picks.** The dropdown offers
  your configured default plus `HEAD`, `HEAD~1`, and `HEAD~3`. To
  compare against an arbitrary branch, tag, or commit, set the default
  in settings, or use the command-line ref names directly.
- **No sub-block partial-line grouping for tables and code blocks.**
  Inline character highlights still land inside rendered tables and
  code, but the renderer cannot always reflow multi-line blocks
  side-by-side; you may see a removed block above an added block rather
  than a paired single-line edit.

---

## 9. Uninstall

1. **Settings → Community plugins → markdiff** → toggle off.
2. Quit Obsidian.
3. Remove the folder:
   ```bash
   rm -rf "<your-vault>/.obsidian/plugins/markdiff"
   ```
4. (Optional) Re-enable another community plugin if you disabled them
   when turning markdiff on for the first time.

No data is written outside the plugin folder, so removing it is fully
reversible: re-copy the build files and toggle it back on.

---

## 10. Getting help

- File an issue at the project's issue tracker.
- For implementation questions, see
  [tech stack and architecture](./tech-stack.md).
- For general Obsidian plugin help, see
  [Obsidian's plugin documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin).
