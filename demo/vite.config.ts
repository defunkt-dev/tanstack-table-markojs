import { defineConfig } from "vite";
import marko from "@marko/run/vite";
import netlify from "@marko/run-adapter-netlify";

export default defineConfig({
  plugins: [
    marko({ adapter: netlify() }),
  ],
});