import { diffChars } from "diff";
import { TextSegment } from "./types";

/** Character-level segments for the deleted and added sides of a changed line. */
export interface SegmentPair {
  /** Old side: `same` runs interleaved with `del` runs. */
  del: TextSegment[];
  /** New side: `same` runs interleaved with `add` runs. */
  add: TextSegment[];
}

/** The common prefix/suffix split between two strings. */
export interface CommonSplit {
  prefix: string;
  oldMid: string;
  newMid: string;
  suffix: string;
}

function segment(kind: TextSegment["kind"], value: string): TextSegment {
  return { kind, value };
}

/**
 * Granular character diff (jsdiff): preserves interior matching runs as their
 * own `same` segments. This is the structured data model carried on
 * `DiffLine.segments`.
 */
export function granularSegments(oldText: string, newText: string): SegmentPair {
  const changes = diffChars(oldText, newText);
  return {
    del: changes
      .filter((c) => !c.added)
      .map((c) => segment(c.removed ? "del" : "same", c.value)),
    add: changes
      .filter((c) => !c.removed)
      .map((c) => segment(c.added ? "add" : "same", c.value)),
  };
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function commonSuffixLength(a: string, b: string, prefix: number): number {
  const limit = Math.min(a.length, b.length) - prefix;
  let i = 0;
  while (i < limit && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  return i;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Split two strings into their shared prefix, differing middles, and shared
 * suffix. The basis for compact partial-line grouping. Prefix/suffix lengths
 * are nudged off surrogate-pair boundaries so astral characters (emoji, some
 * CJK) are never cut mid-code-point.
 */
export function splitCommon(oldText: string, newText: string): CommonSplit {
  let prefix = commonPrefixLength(oldText, newText);
  if (prefix > 0 && isHighSurrogate(oldText.charCodeAt(prefix - 1))) prefix--;
  let suffix = commonSuffixLength(oldText, newText, prefix);
  if (suffix > 0 && isLowSurrogate(oldText.charCodeAt(oldText.length - suffix))) suffix--;
  return {
    prefix: oldText.slice(0, prefix),
    oldMid: oldText.slice(prefix, oldText.length - suffix),
    newMid: newText.slice(prefix, newText.length - suffix),
    suffix: oldText.slice(oldText.length - suffix),
  };
}
