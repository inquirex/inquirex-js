import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/widget.ts"),
      name: "Inquirex",
      fileName: () => "inquirex.js",
      formats: ["iife"],
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
