import { describe, it, expect } from "vitest";
import { toVaultPaths } from "../src/lib/path";

describe("toVaultPaths", () => {
  it("maps repo-relative paths to vault-relative paths when roots coincide", () => {
    // Arrange
    const root = "/vault";

    // Act
    const result = toVaultPaths(["notes/a.md", "b.md"], root, root);

    // Assert
    expect(result).toEqual(["b.md", "notes/a.md"]);
  });

  it("strips the vault prefix when the vault is a subdirectory of the repo", () => {
    // Arrange — vault lives under the repo root.
    const repoRoot = "/repo";
    const vaultRoot = "/repo/vault";

    // Act
    const result = toVaultPaths(["vault/note.md"], repoRoot, vaultRoot);

    // Assert
    expect(result).toEqual(["note.md"]);
  });

  it("drops paths that resolve outside the vault", () => {
    // Arrange — "other/…" is a sibling of the vault, so it resolves to ../.
    const repoRoot = "/repo";
    const vaultRoot = "/repo/vault";

    // Act
    const result = toVaultPaths(["vault/in.md", "other/out.md"], repoRoot, vaultRoot);

    // Assert
    expect(result).toEqual(["in.md"]);
  });

  it("returns a sorted list regardless of input order", () => {
    // Arrange
    const root = "/vault";

    // Act
    const result = toVaultPaths(["z.md", "a.md", "m.md"], root, root);

    // Assert
    expect(result).toEqual(["a.md", "m.md", "z.md"]);
  });
});
