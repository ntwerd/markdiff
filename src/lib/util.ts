/** Cross-cutting helpers shared across the diff, view, and UI layers. */

/** Coerce a thrown/unknown value into a human-readable message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True when `value` is a non-null object (i.e. safe to treat as a record). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
