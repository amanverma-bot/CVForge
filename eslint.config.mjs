// ESLint flat config — covers backend (CommonJS Node) and frontend (React JSX).
// Formatting is Prettier's job; these rules only catch real problems.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "backend/docs/openapi.json", ".husky/**"],
  },
  js.configs.recommended,
  {
    files: ["backend/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...globals.node } },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-control-regex": "off",
    },
  },
  {
    files: ["backend/tests/**/*.js", "backend/vitest.config.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["frontend/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["frontend/*.js", "frontend/*.cjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
  },
];
