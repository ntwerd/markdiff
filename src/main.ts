import { FileSystemAdapter, MarkdownView, Notice, Plugin, WorkspaceLeaf, setIcon } from "obsidian";
import { DEFAULT_SETTINGS, MarkdiffSettings, MarkdiffSettingTab } from "./settings";
import { DiffView, MARKDIFF_VIEW_TYPE, type DiffDisplayMode } from "./view/DiffView";
import { ChangedFilesModal } from "./ui/ChangedFilesModal";
import { Repo } from "./git/repo";

/**
 * markdiff — view git diffs of Markdown files as rendered Markdown.
 *
 * Plugin entry point: wires up the diff view, commands, ribbon, and settings.
 * The diff pipeline lives in:
 *   - git/        — locating the repo and running git via simple-git
 *   - diff/       — parsing unified diffs and refining to character changes
 *   - render/     — rendering changes through Obsidian's MarkdownRenderer
 *   - view/, ui/  — the inline diff view and changed-files browser
 */
export default class MarkdiffPlugin extends Plugin {
  settings: MarkdiffSettings = DEFAULT_SETTINGS;
  private headerButton: HTMLElement | null = null;
  private refreshGeneration = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(MARKDIFF_VIEW_TYPE, (leaf) => new DiffView(leaf, this));

    this.addSettingTab(new MarkdiffSettingTab(this.app, this));

    this.addRibbonIcon("git-compare", "Markdiff: Toggle diff mode", () => {
      this.toggleDiffMode();
    });

    this.addCommand({
      id: "toggle-diff-mode",
      name: "Toggle diff mode",
      callback: () => this.toggleDiffMode(),
    });

    this.addCommand({
      id: "browse-changed-files",
      name: "Browse changed Markdown files",
      callback: () => new ChangedFilesModal(this.app, this).open(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshHeaderButton()),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshHeaderButton()),
    );
  }

  onunload(): void {
    this.removeHeaderButton();
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...parseSettings(await this.loadData()),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Absolute filesystem path for a vault-relative path, or null on mobile. */
  absPath(vaultRelativePath: string): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getFullPath(vaultRelativePath) : null;
  }

  /** Absolute path to the vault root, or null on a non-filesystem adapter. */
  vaultBasePath(): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }

  /**
   * Open (or focus) the inline diff view for a vault-relative Markdown path.
   * When `displayMode` is omitted, the diff view uses its own default
   * ("Changed hunks").
   */
  async openDiff(filePath: string, displayMode?: DiffDisplayMode): Promise<void> {
    const existing = this.findDiffLeaf(filePath);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: MARKDIFF_VIEW_TYPE,
      active: true,
      state: {
        filePath,
        baseRef: this.settings.defaultBaseRef,
        ...(displayMode ? { displayMode } : {}),
      },
    });
  }

  private toggleDiffMode(displayMode?: DiffDisplayMode): void {
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!file) {
      new Notice("Markdiff: open a Markdown note first.");
      return;
    }
    const existing = this.findDiffLeaf(file.path);
    if (existing) {
      existing.detach();
      return;
    }
    void this.openDiff(file.path, displayMode);
  }

  private findDiffLeaf(filePath: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType(MARKDIFF_VIEW_TYPE)) {
      if (leaf.view instanceof DiffView && leaf.view.filePath === filePath) return leaf;
    }
    return null;
  }

  /**
   * Inject a "toggle diff" button into the active Markdown view's header
   * (next to the edit/read-mode toggle), but only when the note lives inside
   * a Git repository. Re-evaluated on every leaf/file change.
   */
  private async refreshHeaderButton(): Promise<void> {
    this.removeHeaderButton();
    const generation = ++this.refreshGeneration;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;

    const absPath = this.absPath(view.file.path);
    if (!absPath) return;

    const repo = await Repo.forFile(absPath, this.settings.gitBinaryPath);
    // Abort if the user switched to a different view while we were checking.
    if (generation !== this.refreshGeneration) return;
    if (!repo) return;

    const viewActions = view.containerEl.querySelector<HTMLElement>(".view-actions");
    if (!viewActions) return;

    this.headerButton = viewActions.createEl("a", {
      cls: "view-action clickable-icon markdiff-header-toggle",
      attr: { "aria-label": "Markdiff: Toggle diff mode" },
    });
    setIcon(this.headerButton, "git-compare");
    this.headerButton.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.toggleDiffMode("whole");
    });
  }

  private removeHeaderButton(): void {
    activeDocument.querySelectorAll(".markdiff-header-toggle").forEach((el) => el.remove());
    this.headerButton = null;
  }
}

function parseSettings(value: unknown): Partial<MarkdiffSettings> {
  if (!isRecord(value)) return {};

  const settings: Partial<MarkdiffSettings> = {};
  if (typeof value.defaultBaseRef === "string") {
    settings.defaultBaseRef = value.defaultBaseRef;
  }
  if (typeof value.colorByAuthor === "boolean") {
    settings.colorByAuthor = value.colorByAuthor;
  }
  if (typeof value.gitBinaryPath === "string") {
    settings.gitBinaryPath = value.gitBinaryPath;
  }
  return settings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
