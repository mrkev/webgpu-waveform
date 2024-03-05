import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  logLevel: "info",
  plugins: [
    react(),
    dts({
      exclude: ["src/site/**"],
    }),
  ],
  build: {
    outDir: "dist",
    minify: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/index.ts"),
      name: "NEW_LIB",
      // the proper extensions will be added
      fileName: "NEW_LIB",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled nto your library
      external: ["react", "react-dom"],
      output: {
        // Provide global variables to use in the UMD build for externalized deps
        globals: {
          react: "React",
          "reactd-dom": "ReactDOM",
        },
      },
    },
  },
});
