import { App, Component, MarkdownRenderer } from "obsidian";
import { DiffHunk, DiffLine, FileDiff } from "../diff/types";
import { splitCommon } from "../diff/segments";

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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.kind === "del" && line.segments && next?.kind === "add" && next.segments) {
      await renderChangedPair(app, line, next, containerEl, sourcePath, component, options);
      i++; // consumed the paired add line
      continue;
    }
    await renderStandaloneLine(app, line, containerEl, sourcePath, component, options);
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
