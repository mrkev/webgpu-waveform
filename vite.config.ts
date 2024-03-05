import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the site
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: "src",
  build: {
    outDir: "../docs",
    // minify: false,
  },
  // instead of having absolute paths pointing at assets in `index.html`, use
  // relative paths. Works better with github pages where /assets/foobar.js
  // referes to another site
  base: "./",
});
