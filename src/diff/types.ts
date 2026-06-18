/** A single character-level segment within a changed line. */
export interface TextSegment {
  value: string;
  kind: "add" | "del" | "same";
}

/** One line of a parsed diff, classified and refined for changed text. */
export interface DiffLine {
  kind: "add" | "del" | "context";
  /** Raw line text (without the leading +/-/space marker). */
  text: string;
  /** Character-level segments, populated for paired add/del lines. */
  segments?: TextSegment[];
  /** Old/new line numbers, when known. */
  oldLine?: number;
  newLine?: number;
  /** Commit author for this line, when color-by-author is enabled. */
  author?: string;
}

/** A contiguous block of changes plus surrounding context. */
export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}
