/** Information about an opening code fence (``` or ~~~). */
export interface FenceInfo {
  char: string;
  length: number;
}

const FENCE_RE = /^(`{3,}|~{3,})/;

/**
 * Detect a Markdown code-fence opener at the start of `text` — three or more
 * backticks or tildes. Returns null for non-fence lines. Exported (not kept
 * inside the render layer) so the detection rules are unit-testable without
 * the Obsidian/DOM dependency.
 */
export function detectFence(text: string): FenceInfo | null {
  const match = text.match(FENCE_RE);
  if (!match) return null;
  const fence = match[1];
  return { char: fence[0], length: fence.length };
}

/**
 * True when `text` is a closing fence matching `opening`: at least as many of
 * the same fence character, optional trailing whitespace, and nothing else.
 */
export function isClosingFence(text: string, opening: FenceInfo): boolean {
  return new RegExp(`^${opening.char}{${opening.length},}\\s*$`).test(text);
}
