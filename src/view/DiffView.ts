import {
  ButtonComponent,
  Component,
  DropdownComponent,
  ItemView,
  Notice,
  WorkspaceLeaf,
  type IconName,
  type ViewStateResult,
} from "obsidian";
import type MarkdiffPlugin from "../main";
import { Repo } from "../git/repo";
import { parseUnifiedDiff } from "../diff/parse";
import { attachAuthors, parseBlamePorcelain } from "../diff/blame";
import { renderFileDiff } from "../render/renderDiff";

export const MARKDIFF_VIEW_TYPE = "markdiff-view";

interface DiffViewState {
  /** Vault-relative path of the file under diff. */
  filePath: string;
  /** Ref compared against the working tree. */
  baseRef: string;
}

const RESTORE_CONFIRM_MS = 4000;

/**
 * Inline diff mode: a workspace leaf that renders the git diff of one Markdown
 * note as rendered Markdown, with a compare banner, change navigation, and
 * one-click restore. Toggling the command closes the leaf to exit diff mode.
 */
export class DiffView extends ItemView {
  private state: DiffViewState;
  private renderComponent: Component | null = null;
  private body: HTMLElement | null = null;
  private changeEls: HTMLElement[] = [];
  private changeIndex = -1;
  private restoreTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MarkdiffPlugin,
  ) {
    super(leaf);
    this.state = { filePath: "", baseRef: plugin.settings.defaultBaseRef };
  }

  getViewType(): string {
    return MARKDIFF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.state.filePath ? `Diff: ${this.state.filePath}` : "Markdiff";
  }

  getIcon(): IconName {
    return "git-compare";
  }

  /** Vault-relative path currently shown, used to detect an existing leaf. */
  get filePath(): string {
    return this.state.filePath;
  }

  override getState(): Record<string, unknown> {
    return { filePath: this.state.filePath, baseRef: this.state.baseRef };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (isRecord(state)) {
      const filePath = typeof state.filePath === "string" ? state.filePath : this.state.filePath;
      const baseRef =
        typeof state.baseRef === "string" && state.baseRef.length > 0
          ? state.baseRef
          : this.plugin.settings.defaultBaseRef;
      this.state = { filePath, baseRef };
    }
    await super.setState(state, result);
    await this.rebuild();
  }

  override async onOpen(): Promise<void> {
    await this.rebuild();
  }

  override async onClose(): Promise<void> {
    this.clearRestoreTimer();
    if (this.renderComponent) {
      this.removeChild(this.renderComponent);
      this.renderComponent = null;
    }
  }

  private clearRestoreTimer(): void {
    if (this.restoreTimer !== null) {
      window.clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }

  /** Rebuild the chrome (banner + body) and render the diff. */
  private async rebuild(): Promise<void> {
    const { contentEl } = this;
    this.clearRestoreTimer();
    contentEl.empty();
    if (this.renderComponent) this.removeChild(this.renderComponent);
    this.renderComponent = new Component();
    this.addChild(this.renderComponent);

    const root = contentEl.createDiv({ cls: "markdiff-view" });
    if (!this.state.filePath) {
      root.createEl("p", { text: "No file selected for diff." });
      return;
    }

    this.buildBanner(root);
    this.body = root.createDiv({ cls: "markdiff-body" });
    await this.renderDiff();
  }

  private buildBanner(root: HTMLElement): void {
    const banner = root.createDiv({ cls: "markdiff-banner" });
    banner.createSpan({ cls: "markdiff-banner-path", text: this.state.filePath });

    const dropdown = new DropdownComponent(banner);
    for (const ref of this.baseRefOptions()) {
      dropdown.addOption(ref, `${ref} ↔ working tree`);
    }
    dropdown.setValue(this.state.baseRef);
    dropdown.onChange(async (value) => {
      this.state = { ...this.state, baseRef: value };
      this.app.workspace.requestSaveLayout();
      this.refreshBannerText(banner);
      await this.renderDiff();
    });

    this.buildRestoreButton(banner);

    const nav = banner.createDiv({ cls: "markdiff-nav" });
    new ButtonComponent(nav)
      .setIcon("arrow-up")
      .setTooltip("Previous change")
      .onClick(() => this.goToChange(-1));
    new ButtonComponent(nav)
      .setIcon("arrow-down")
      .setTooltip("Next change")
      .onClick(() => this.goToChange(1));
  }

  private buildRestoreButton(banner: HTMLElement): void {
    const button = new ButtonComponent(banner);
    let armed = false;

    const reset = (): void => {
      armed = false;
      button.setButtonText(`Restore ${this.state.baseRef}`);
      button.buttonEl.removeClass("mod-warning");
    };
    reset();
    button.setTooltip("Restore this file to the selected ref (overwrites the working copy)");

    button.onClick(async () => {
      if (!armed) {
        armed = true;
        button.setButtonText("Click again to confirm");
        button.buttonEl.addClass("mod-warning");
        this.clearRestoreTimer();
        this.restoreTimer = window.setTimeout(reset, RESTORE_CONFIRM_MS);
        return;
      }
      this.clearRestoreTimer();
      reset();
      await this.restore();
    });
  }

  private refreshBannerText(banner: HTMLElement): void {
    const path = banner.querySelector<HTMLElement>(".markdiff-banner-path");
    if (path) path.setText(this.state.filePath);
  }

  private baseRefOptions(): string[] {
    return [...new Set([this.plugin.settings.defaultBaseRef, "HEAD", "HEAD~1", "HEAD~3"])].filter(
      (ref) => ref.length > 0,
    );
  }

  private async renderDiff(): Promise<void> {
    const body = this.body;
    const component = this.renderComponent;
    if (!body || !component) return;
    body.empty();
    this.changeEls = [];
    this.changeIndex = -1;

    const absPath = this.plugin.absPath(this.state.filePath);
    if (!absPath) {
      body.createEl("p", { text: "Markdiff requires a local (desktop) vault." });
      return;
    }

    try {
      const repo = await Repo.forFile(absPath, this.plugin.settings.gitBinaryPath);
      if (!repo) {
        body.createEl("p", { text: "This file is not inside a Git repository." });
        return;
      }

      const relPath = repo.relPathFor(absPath);
      const unified = await repo.diffRefs(relPath, this.state.baseRef);
      if (!unified.trim()) {
        body.createEl("p", {
          text: `No changes between ${this.state.baseRef} and the working tree.`,
        });
        return;
      }

      const fileDiffs = parseUnifiedDiff(unified);
      let diff = fileDiffs.find((d) => d.newPath === relPath || d.oldPath === relPath) ?? fileDiffs[0];
      if (!diff) {
        body.createEl("p", { text: "No diff to display." });
        return;
      }

      if (this.plugin.settings.colorByAuthor) {
        diff = await this.withAuthors(repo, relPath, diff);
      }

      await renderFileDiff(this.app, diff, body, this.state.filePath, component, {
        colorByAuthor: this.plugin.settings.colorByAuthor,
      });
      this.changeEls = Array.from(body.querySelectorAll<HTMLElement>(".markdiff-change"));
    } catch (err) {
      body.empty();
      body.createEl("p", { text: `Markdiff: ${errorMessage(err)}` });
    }
  }

  private async withAuthors(repo: Repo, relPath: string, diff: ReturnType<typeof parseUnifiedDiff>[number]) {
    try {
      const blame = await repo.blamePorcelain(relPath);
      return attachAuthors(diff, parseBlamePorcelain(blame));
    } catch {
      // Blame fails for untracked/unborn files; render without author colour.
      return diff;
    }
  }

  private async restore(): Promise<void> {
    const absPath = this.plugin.absPath(this.state.filePath);
    if (!absPath) return;
    try {
      const repo = await Repo.forFile(absPath, this.plugin.settings.gitBinaryPath);
      if (!repo) {
        new Notice("Markdiff: not a Git repository.");
        return;
      }
      await repo.restore(repo.relPathFor(absPath), this.state.baseRef);
      new Notice(`Restored ${this.state.filePath} to ${this.state.baseRef}.`);
      await this.renderDiff();
    } catch (err) {
      new Notice(`Markdiff: restore failed — ${errorMessage(err)}`);
    }
  }

  private goToChange(delta: number): void {
    if (this.changeEls.length === 0) {
      new Notice("Markdiff: no changes to navigate.");
      return;
    }
    const count = this.changeEls.length;
    this.changeIndex = (this.changeIndex + delta + count) % count;
    for (const el of this.changeEls) el.removeClass("markdiff-current");
    const target = this.changeEls[this.changeIndex];
    target.addClass("markdiff-current");
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
