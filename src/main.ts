import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MarkdiffSettings, MarkdiffSettingTab } from "./settings";

/**
 * markdiff — view git diffs of Markdown files as rendered Markdown.
 *
 * This is the plugin entry point. It wires up commands, the ribbon icon, and
 * settings. The actual diff pipeline lives in:
 *   - git/        — locating the repo and running git via simple-git
 *   - diff/       — parsing unified diffs and refining to character changes
 *   - render/     — rendering changes through Obsidian's MarkdownRenderer
 */
export default class MarkdiffPlugin extends Plugin {
  settings: MarkdiffSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

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
      callback: () => this.browseChangedFiles(),
    });
  }

  onunload(): void {
    // Views/components registered via this.register* are cleaned up automatically.
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

  // --- Command stubs --------------------------------------------------------
  // These are intentionally unimplemented scaffolding. Implement against the
  // git/diff/render modules described in docs/tech-stack.md.

  private toggleDiffMode(): void {
    // TODO: enter/exit inline diff mode for the active Markdown view.
    throw new Error("Not implemented");
  }

  private browseChangedFiles(): void {
    // TODO: open a modal listing changed Markdown files (git status --porcelain).
    throw new Error("Not implemented");
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
