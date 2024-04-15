import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import highlight from "rehype-highlight";
import { defineConfig } from "vite";
// from: https://mikebifulco.com/posts/mdx-auto-link-headings-with-rehype-slug
// add IDs to any h1-h6 tag that doesn't have one, using a slug made from its text
import rehypeSlug from "rehype-slug";

// Builds the site
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mdx({ rehypePlugins: [highlight, rehypeSlug] }),
    // externalizeDeps({
    //   deps: false,
    //   devDeps: false,
    //   except: [],
    //   optionalDeps: true,
    //   peerDeps: true,
    // }),
  ],
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
