import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["**/dist/**", "**/coverage/**", "docs/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts"],
      },
      "import/resolver": {
        node: true,
        typescript: {
          alwaysTryTypes: true,
          project: ["packages/*/tsconfig.json"],
        },
      },
    },
    rules: {
      // TypeScript handles undefined checks
      "no-undef": "off",
      // TypeScript ESLint recommended rules
      ...tsPlugin.configs.recommended.rules,
      // Overrides
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-inferrable-types": [
        "warn",
        { ignoreParameters: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-var-requires": "off",
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "unknown",
          ],
        },
      ],
    },
  },
  // Must be last — disables ESLint rules that conflict with Prettier
  eslintConfigPrettier,
];
