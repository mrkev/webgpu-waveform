module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "plugin:react-hooks/recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react/no-unescaped-entities": "off",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: [
      "./packages/site/tsconfig.json",
      "./packages/site/tsconfig.node.json",
      "./packages/webgpu-waveform/tsconfig.json",
      "./packages/webgpu-waveform/tsconfig.node.json",
    ],
    tsconfigRootDir: __dirname,
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
