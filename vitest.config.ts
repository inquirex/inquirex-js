import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/engine.ts",
        "src/theme.ts",
        "src/server-verb.ts",
        "src/config.ts",
      ],
      reporter: ["text", "html"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
