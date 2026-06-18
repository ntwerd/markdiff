import { FileSystemAdapter, MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, MarkdiffSettings, MarkdiffSettingTab } from "./settings";
import { DiffView, MARKDIFF_VIEW_TYPE } from "./view/DiffView";
import { ChangedFilesModal } from "./ui/ChangedFilesModal";

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

  /** Open (or focus) the inline diff view for a vault-relative Markdown path. */
  async openDiff(filePath: string): Promise<void> {
    const existing = this.findDiffLeaf(filePath);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: MARKDIFF_VIEW_TYPE,
      active: true,
      state: { filePath, baseRef: this.settings.defaultBaseRef },
    });
  }

  private toggleDiffMode(): void {
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
    void this.openDiff(file.path);
  }

  private findDiffLeaf(filePath: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType(MARKDIFF_VIEW_TYPE)) {
      if (leaf.view instanceof DiffView && leaf.view.filePath === filePath) return leaf;
    }
    return null;
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
