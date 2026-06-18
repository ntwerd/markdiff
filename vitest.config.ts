import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Modules excluded from the coverage gate because they require the
      // Obsidian runtime host (DOM + app APIs) or a live git subprocess, and
      // are verified manually/in-app rather than via unit tests. The gate
      // therefore measures the genuinely unit-testable surface: diff/, lib/,
      // and the pure git security guards.
      exclude: [
        "src/main.ts", // plugin lifecycle (Obsidian host)
        "src/settings.ts", // settings tab UI (Obsidian host)
        "src/view/**", // diff view UI (DOM + Obsidian)
        "src/ui/**", // modals (DOM + Obsidian)
        "src/render/**", // MarkdownRenderer / DOM rendering
        "src/git/repo.ts", // simple-git subprocess wrapper (integration)
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
