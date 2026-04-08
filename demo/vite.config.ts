import { defineConfig } from "vite";
import { resolve } from "path";

// Points "tanstack-table-markojs" imports directly at the TypeScript source in the
// root package — no `npm run build` required during development.
// Vite + esbuild compile it on the fly exactly like any other local file.
export default defineConfig({
  resolve: {
    alias: {
      "tanstack-table-markojs": resolve(__dirname, "../src/index.ts"),
    },
  },
});
