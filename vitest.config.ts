import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Only test/markdown.test.ts opts into a DOM (via a @vitest-environment
    // docblock); everything else stays DOM-free and fast. Sanitizer tests
    // parse hostile markup on purpose, so stop happy-dom from fetching what
    // an injected iframe points at — a correctly-blocked element would
    // otherwise still produce a teardown error in CI output.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          disableJavaScriptFileLoading: true,
        },
      },
    },
    coverage: {
      provider: "v8",
      include: [
        "src/engine.ts",
        "src/markdown.ts",
        "src/theme.ts",
        "src/server-verb.ts",
        "src/config.ts",
      ],
      reporter: ["text", "html"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
