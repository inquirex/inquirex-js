import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Tests opt into a DOM per-file via a @vitest-environment docblock; the
    // pure-logic suites (engine, config, server-verb, theme) stay DOM-free and
    // fast. Sanitizer and widget tests parse hostile markup on purpose, so
    // happy-dom is told not to fetch what injected markup points at. The
    // sanitizer no longer depends on this — it parses inside an inert
    // <template> — but a test that builds live DOM still might.
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
      // Everything shipped in the bundle is measured. An explicit file list
      // was hiding the largest module in the package (widget.ts) behind a
      // healthy-looking number; a glob cannot drift out of date as files are
      // added.
      include: ["src/**/*.ts"],
      // types.ts is interfaces and type aliases only — it transpiles to an
      // empty module, so it contributes nothing but a 0/0 row.
      exclude: ["src/types.ts"],
      reporter: ["text", "html"],
      // A ratchet, set just under where the suite actually stands, so a drop
      // fails the build instead of being noticed a release later. Raise these
      // when coverage rises; do not lower them to make a red build green.
      thresholds: { lines: 99, functions: 100, branches: 92, statements: 97 },
    },
  },
});
