import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/media/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/dashboard/src/**/*.ts", "apps/dashboard/src/**/*.tsx"],
    languageOptions: { globals: { window: "readonly", document: "readonly", console: "readonly" } }
  },
  {
    files: ["apps/core/src/**/*.ts", "apps/extension/src/**/*.ts", "packages/**/*.ts"],
    languageOptions: { globals: { process: "readonly", console: "readonly", Buffer: "readonly" } }
  },
  { files: ["**/*.test.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } }
);
