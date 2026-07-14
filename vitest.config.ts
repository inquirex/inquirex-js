import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine.ts", "src/theme.ts", "src/extract-client.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
