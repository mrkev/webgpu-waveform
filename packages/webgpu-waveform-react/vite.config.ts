import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  logLevel: "info",
  plugins: [dts({ rollupTypes: true })],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    minify: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/index.ts"),
      name: "webgpu-waveform-react",
      // the proper extensions will be added
      fileName: "webgpu-waveform-react",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled nto your library
      // from: https://stackoverflow.com/questions/76135802/how-do-i-make-my-react-package-use-an-external-jsx-runtime
      external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
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
