// ESLint flat config (ESLint v9+)
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  // 0) Ignorer ce qui ne doit pas être typé
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      // ⬇️ très important : on ignore le fichier de config lui-même
      "eslint.config.*"
    ],
  },

  // 1) JS de base
  js.configs.recommended,

  // 2) TypeScript NON typé (rapide, pas de `project`)
  //    -> si tu veux du typé, vois la solution B
  ...tseslint.configs.recommended,

  // 3) Activer le parser TS uniquement pour nos sources/tests
  {
    files: ["src/**/*.ts", "__tests__/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      // ⚠️ pas de parserOptions.project ici → pas d’erreur
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-console": "off",
    },
    language: "ts",
  },

  // 4) Globals Node/Jest
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
