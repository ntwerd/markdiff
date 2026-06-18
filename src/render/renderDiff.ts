import { App, Component, MarkdownRenderer } from "obsidian";
import { DiffHunk, DiffLine, FileDiff } from "../diff/types";
import { splitCommon } from "../diff/segments";
import { colorForAuthor } from "../lib/color";
import { detectFence, isClosingFence } from "../lib/fence";

export interface RenderOptions {
  /** Tint each line with its commit author's colour when an author is set. */
  colorByAuthor?: boolean;
}

/** Placeholder so empty added/removed lines still render a visible row. */
const EMPTY_LINE = " ";

/**
 * Render one parsed `FileDiff` into `containerEl` as rendered Markdown.
 *
 * Each diff line is rendered through Obsidian's `MarkdownRenderer`, classified
 * with a block-level class (`.markdiff-block-add` / `-del` / `.markdiff-context`).
 * Adjacent delete/add pairs are merged into a single compact line whose changed
 * characters are wrapped in `.markdiff-del` / `.markdiff-add` spans — computed
 * against the *rendered* text so the highlight lands inside headings, bold,
 * links, and code spans.
 */
export async function renderFileDiff(
  app: App,
  diff: FileDiff,
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
  options: RenderOptions = {},
): Promise<void> {
  containerEl.empty();
  containerEl.addClass("markdiff-view");

  for (const hunk of diff.hunks) {
    await renderHunk(app, hunk, containerEl, sourcePath, component, options);
  }
}

async function renderHunk(
  app: App,
  hunk: DiffHunk,
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
  options: RenderOptions,
): Promise<void> {
  const { lines } = hunk;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    // Fenced code blocks (``` or ~~~) span multiple lines. Render the whole
    // block as one Markdown unit so multi-line constructs like Mermaid
    // diagrams parse correctly instead of triggering "No diagram type
    // detected" errors from per-line rendering.
    const fence = detectFence(line.text);
    if (fence) {
      const block: DiffLine[] = [line];
      let j = i + 1;
      while (j < lines.length) {
        block.push(lines[j]);
        if (isClosingFence(lines[j].text, fence)) {
          j++;
          // Consume consecutive closing fences (interleaved del/add pairs
          // in a modified code block produce two closing-fence lines).
          while (j < lines.length && isClosingFence(lines[j].text, fence)) {
            block.push(lines[j]);
            j++;
          }
          break;
        }
        j++;
      }
      await renderCodeBlock(app, block, containerEl, sourcePath, component, options);
      i = j;
      continue;
    }

    // If the next line opens a code fence, don't pair the current line with
    // it — render it standalone so the fence is handled on the next iteration.
    if (next && detectFence(next.text)) {
      await renderStandaloneLine(app, line, containerEl, sourcePath, component, options);
      i++;
      continue;
    }

    if (line.kind === "del" && line.segments && next?.kind === "add" && next.segments) {
      await renderChangedPair(app, line, next, containerEl, sourcePath, component, options);
      i += 2;
      continue;
    }
    await renderStandaloneLine(app, line, containerEl, sourcePath, component, options);
    i++;
  }
}

async function renderCodeBlock(
  app: App,
  blockLines: DiffLine[],
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
  options: RenderOptions,
): Promise<void> {
  const kinds = new Set(blockLines.map((l) => l.kind));

  if (kinds.size === 1) {
    const kind = blockLines[0].kind;
    const blockClass =
      kind === "add"
        ? "markdiff-block-add"
        : kind === "del"
          ? "markdiff-block-del"
          : "markdiff-context";
    const markdown = blockLines.map((l) => l.text).join("\n");
    const lineEl = containerEl.createDiv({ cls: `markdiff-line ${blockClass}` });
    if (kind !== "context") lineEl.addClass("markdiff-change");
    const authorLine = blockLines.find((l) => l.author);
    if (authorLine) applyAuthor(lineEl, authorLine, options);
    await renderInline(app, markdown || EMPTY_LINE, lineEl, sourcePath, component);
    return;
  }

  // Mixed kinds (modified code block): separate into old (del + context) and
  // new (add + context) so each side is a valid, complete code block.
  const oldLines = blockLines.filter((l) => l.kind !== "add");
  const newLines = blockLines.filter((l) => l.kind !== "del");

  for (const [lines, blockClass] of [
    [oldLines, "markdiff-block-del"],
    [newLines, "markdiff-block-add"],
  ] as const) {
    if (lines.length === 0) continue;
    const markdown = lines.map((l) => l.text).join("\n");
    const lineEl = containerEl.createDiv({ cls: `markdiff-line ${blockClass} markdiff-change` });
    const authorLine = lines.find((l) => l.author);
    if (authorLine) applyAuthor(lineEl, authorLine, options);
    await renderInline(app, markdown || EMPTY_LINE, lineEl, sourcePath, component);
  }
}

async function renderStandaloneLine(
  app: App,
  line: DiffLine,
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
  options: RenderOptions,
): Promise<void> {
  const blockClass =
    line.kind === "add"
      ? "markdiff-block-add"
      : line.kind === "del"
        ? "markdiff-block-del"
        : "markdiff-context";

  const lineEl = containerEl.createDiv({ cls: `markdiff-line ${blockClass}` });
  if (line.kind !== "context") lineEl.addClass("markdiff-change");
  applyAuthor(lineEl, line, options);
  await renderInline(app, line.text || EMPTY_LINE, lineEl, sourcePath, component);
}

async function renderChangedPair(
  app: App,
  del: DiffLine,
  add: DiffLine,
  containerEl: HTMLElement,
  sourcePath: string,
  component: Component,
  options: RenderOptions,
): Promise<void> {
  const lineEl = containerEl.createDiv({ cls: "markdiff-line markdiff-block-change markdiff-change" });
  applyAuthor(lineEl, add, options);

  // Render the new line, then locate the change against the rendered text.
  await renderInline(app, add.text || EMPTY_LINE, lineEl, sourcePath, component);
  const newRendered = lineEl.textContent ?? "";
  const oldRendered = await renderedTextOf(app, del.text || EMPTY_LINE, sourcePath);

  const { prefix, oldMid, newMid } = splitCommon(oldRendered, newRendered);
  const start = prefix.length;

  const addSpan = newMid.length > 0 ? wrapRange(lineEl, start, start + newMid.length, "markdiff-add") : null;
  if (oldMid.length > 0) {
    // Place the removed text immediately before the added run when there is
    // one (exact, no boundary ambiguity); otherwise insert at the edit offset.
    if (addSpan?.parentNode) {
      addSpan.parentNode.insertBefore(createSpanEl("markdiff-del", oldMid), addSpan);
    } else {
      insertSpanAt(lineEl, start, "markdiff-del", oldMid);
    }
  }
}

async function renderInline(
  app: App,
  markdown: string,
  el: HTMLElement,
  sourcePath: string,
  component: Component,
): Promise<void> {
  await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
  unwrapSoleParagraph(el);
}

async function renderedTextOf(app: App, markdown: string, sourcePath: string): Promise<string> {
  // Measurement render: own the lifecycle locally so any embeds/transclusions
  // spawned for the throwaway element are unloaded immediately.
  const scratch = activeDocument.createElement("div");
  const owner = new Component();
  owner.load();
  try {
    await MarkdownRenderer.render(app, markdown, scratch, sourcePath, owner);
    return scratch.textContent ?? "";
  } finally {
    owner.unload();
  }
}

/** Collapse a sole wrapping `<p>` so each diff line renders tightly. */
function unwrapSoleParagraph(el: HTMLElement): void {
  if (el.children.length === 1 && el.children[0].tagName === "P") {
    const p = el.children[0];
    while (p.firstChild) el.insertBefore(p.firstChild, p);
    el.removeChild(p);
  }
}

function applyAuthor(lineEl: HTMLElement, line: DiffLine, options: RenderOptions): void {
  if (!options.colorByAuthor || !line.author) return;
  lineEl.addClass("markdiff-author");
  lineEl.style.setProperty("--markdiff-author-color", colorForAuthor(line.author));
  lineEl.setAttribute("aria-label", `Changed by ${line.author}`);
}

function createSpanEl(className: string, text: string): HTMLSpanElement {
  const span = activeDocument.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function textNodesOf(root: HTMLElement): Text[] {
  const walker = activeDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * Wrap the `[start, end)` slice of `root`'s text content in span(s) with
 * `className`, splitting text nodes (and spanning inline elements) as needed.
 * Returns the first span created, or null if the range was empty.
 */
function wrapRange(root: HTMLElement, start: number, end: number, className: string): HTMLSpanElement | null {
  if (end <= start) return null;
  let firstSpan: HTMLSpanElement | null = null;
  let offset = 0;
  for (const node of textNodesOf(root)) {
    const nodeStart = offset;
    const nodeEnd = offset + node.data.length;
    offset = nodeEnd;

    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (from >= to) continue;

    const localFrom = from - nodeStart;
    const localTo = to - nodeStart;
    const before = node.data.slice(0, localFrom);
    const mid = node.data.slice(localFrom, localTo);
    const after = node.data.slice(localTo);

    const parent = node.parentNode;
    if (!parent) continue;
    const span = createSpanEl(className, mid);
    if (!firstSpan) firstSpan = span;
    const frag = activeDocument.createDocumentFragment();
    if (before) frag.appendChild(activeDocument.createTextNode(before));
    frag.appendChild(span);
    if (after) frag.appendChild(activeDocument.createTextNode(after));
    parent.replaceChild(frag, node);
  }
  return firstSpan;
}

/** Insert a span containing `text` at text-content `offset` within `root`. */
function insertSpanAt(root: HTMLElement, offset: number, className: string, text: string): void {
  const span = createSpanEl(className, text);
  let pos = 0;
  for (const node of textNodesOf(root)) {
    const nodeStart = pos;
    const nodeEnd = pos + node.data.length;
    pos = nodeEnd;
    if (offset > nodeEnd) continue;

    const parent = node.parentNode;
    if (!parent) continue;
    const local = offset - nodeStart;
    if (local <= 0) {
      parent.insertBefore(span, node);
    } else if (local >= node.data.length) {
      parent.insertBefore(span, node.nextSibling);
    } else {
      const after = node.splitText(local);
      parent.insertBefore(span, after);
    }
    return;
  }
  root.appendChild(span);
}
