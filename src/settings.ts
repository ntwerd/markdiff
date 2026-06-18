import { App, PluginSettingTab, Setting } from "obsidian";
import type MarkdiffPlugin from "./main";

export interface MarkdiffSettings {
  /** Default ref to compare the working copy against (e.g. "HEAD"). */
  defaultBaseRef: string;
  /** Colour-code each change by its commit author (via git blame). */
  colorByAuthor: boolean;
  /**
   * Absolute path to the git binary. Empty = resolve from PATH.
   * Needed on macOS where GUI-launched Obsidian does not inherit the shell
   * PATH and cannot find a Homebrew git at /opt/homebrew/bin.
   */
  gitBinaryPath: string;
}

export const DEFAULT_SETTINGS: MarkdiffSettings = {
  defaultBaseRef: "HEAD",
  colorByAuthor: true,
  gitBinaryPath: "",
};

export class MarkdiffSettingTab extends PluginSettingTab {
  plugin: MarkdiffPlugin;

  constructor(app: App, plugin: MarkdiffPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default base ref")
      .setDesc("What to compare the working copy against by default.")
      .addText((text) =>
        text
          .setPlaceholder("HEAD")
          .setValue(this.plugin.settings.defaultBaseRef)
          .onChange(async (value) => {
            this.plugin.settings.defaultBaseRef = value.trim() || "HEAD";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Colour-code by author")
      .setDesc("Show who made each change using a per-author colour (Git blame).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorByAuthor)
          .onChange(async (value) => {
            this.plugin.settings.colorByAuthor = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Git binary path")
      .setDesc(
        "Optional. Absolute path to git if it is not found on PATH " +
          "(common on macOS, e.g. /opt/homebrew/bin/git).",
      )
      .addText((text) =>
        text
          .setPlaceholder("(Resolve from path)")
          .setValue(this.plugin.settings.gitBinaryPath)
          .onChange(async (value) => {
            this.plugin.settings.gitBinaryPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
