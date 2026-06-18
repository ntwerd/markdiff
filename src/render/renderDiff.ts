import { App, Component, MarkdownRenderer } from "obsidian";
import { FileDiff } from "../diff/types";

/**
 * Render a parsed diff into `containerEl` as rendered Markdown with character
 * highlight spans.
 *
 * Strategy (see docs/tech-stack.md): render each changed line's text through
 * Obsidian's MarkdownRenderer, then walk the produced DOM and wrap the
 * character-level segments in `.markdiff-add` / `.markdiff-del` spans. This
 * keeps the output real, formatted Markdown rather than raw diff text.
 *
 * `component` owns the lifecycle of anything the renderer spawns (embeds,
 * transclusions); pass a Component you control and unload it on exit, or the
 * rendered children will leak.
 */
export async function renderFileDiff(
  app: App,
  diff: FileDiff,
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
): Promise<void> {
  containerEl.empty();
  containerEl.addClass("markdiff-view");

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      const lineEl = containerEl.createDiv({
        cls: `markdiff-line markdiff-${line.kind}`,
      });
      if (line.author) {
        lineEl.addClass("markdiff-author");
        lineEl.style.setProperty(
          "--markdiff-author-color",
          colorForAuthor(line.author),
        );
      }

      // TODO: when line.segments is present, render character-level spans
      // instead of the whole line. For the scaffold we render the line text
      // wholesale.
      await MarkdownRenderer.render(app, line.text, lineEl, sourcePath, component);
    }
  }
}

/** Deterministic pastel colour per author name. */
export function colorForAuthor(author: string): string {
  let hash = 0;
  for (let i = 0; i < author.length; i++) {
    hash = (hash << 5) - hash + author.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(70% 0.12 ${hue})`;
}
