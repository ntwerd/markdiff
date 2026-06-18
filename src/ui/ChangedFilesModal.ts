import { App, Modal, Setting } from "obsidian";
import { realpath } from "node:fs/promises";
import type MarkdiffPlugin from "../main";
import { Repo } from "../git/repo";
import { errorMessage } from "../lib/util";
import { toVaultPaths } from "../lib/path";

/**
 * Modal listing the vault's changed Markdown files. Selecting one opens it in
 * the inline diff view. The git status list is filtered to Markdown notes and
 * to files that live inside the vault.
 */
export class ChangedFilesModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: MarkdiffPlugin,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Changed Markdown files" });
    const list = contentEl.createDiv({ cls: "markdiff-changed-list" });
    list.createEl("p", { text: "Loading…" });

    const vaultRoot = this.plugin.vaultBasePath();
    if (!vaultRoot) {
      this.message(list, "Markdiff requires a local (desktop) vault.");
      return;
    }

    try {
      const repo = await Repo.forDir(vaultRoot, this.plugin.settings.gitBinaryPath);
      if (!repo) {
        this.message(list, "Vault is not inside a Git repository.");
        return;
      }

      const files = await repo.changedMarkdownFiles();
      // git canonicalises repo.root (symlinks resolved); match it so the
      // relative mapping holds when the vault path traverses a symlink.
      const vaultPaths = toVaultPaths(files, repo.root, await realpath(vaultRoot));

      list.empty();
      if (vaultPaths.length === 0) {
        this.message(list, "No changed Markdown files.");
        return;
      }

      for (const path of vaultPaths) {
        new Setting(list).setName(path).addButton((btn) =>
          btn
            .setButtonText("Diff")
            .setCta()
            .onClick(() => {
              this.close();
              void this.plugin.openDiff(path);
            }),
        );
      }
    } catch (err) {
      this.message(list, `Markdiff: ${errorMessage(err)}`);
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private message(list: HTMLElement, text: string): void {
    list.empty();
    list.createEl("p", { text });
  }
}
