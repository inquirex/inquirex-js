import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Per-form bundles (qualified.at's `inquirex-<form-id>.js`) rebuild with the
  // config inlined here, e.g. `--define:__INQUIREX_BAKED_CONFIG__=...`. Normal
  // builds leave it null, so the widget falls back to script attrs / global.
  define: {
    __INQUIREX_BAKED_CONFIG__: "null",
  },
  build: {
    lib: {
      // The barrel registers <inquirex-widget> and re-exports the public API.
      entry: resolve(__dirname, "src/index.ts"),
      name: "Inquirex",
      // inquirex.js  -> IIFE for <script src> embedding (CDN, unpkg, jsdelivr)
      // inquirex.mjs -> ESM for `import { FlowEngine } from "inquirex-js"`
      fileName: (format) =>
        format === "iife" ? "inquirex.js" : "inquirex.mjs",
      formats: ["iife", "es"],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: "esbuild",
    target: "es2022",
  },
  server: {
    port: 3100,
    open: "/index.html",
  },
});
