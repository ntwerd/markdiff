import { join, relative, sep } from "node:path";

/**
 * Convert repo-relative git paths to vault-relative paths that live inside the
 * vault. Paths that resolve outside the vault (a `../` prefix) or are empty are
 * dropped, and results are sorted for stable display. Pure — extracted from the
 * modal so the path-mapping logic is unit-testable without the Obsidian/DOM
 * dependency.
 */
export function toVaultPaths(repoRelPaths: string[], repoRoot: string, vaultRoot: string): string[] {
  const out: string[] = [];
  for (const repoRel of repoRelPaths) {
    const abs = join(repoRoot, repoRel);
    const vaultRel = relative(vaultRoot, abs).split(sep).join("/");
    if (vaultRel.length > 0 && !vaultRel.startsWith("../")) out.push(vaultRel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
