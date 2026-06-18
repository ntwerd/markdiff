/** Deterministic pastel colour per author name, used for color-by-author. */
export function colorForAuthor(author: string): string {
  let hash = 0;
  for (let i = 0; i < author.length; i++) {
    hash = (hash << 5) - hash + author.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(70% 0.12 ${hue})`;
}
