import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Same philosophy as the backend config: correctness rules only.
 *
 * The two that earn their place here are react-hooks/exhaustive-deps, which
 * catches the stale-closure class of bug in the many useEffect blocks driving
 * the map and socket layers, and no-floating-promises, which catches an
 * unhandled fetch rejection surfacing as a silently dead UI.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "*.config.mjs", "*.config.ts"]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        AbortController: "readonly",
        HTMLElement: "readonly",
        Headers: "readonly",
        URL: "readonly",
        AudioContext: "readonly",
        Event: "readonly",
        EventListener: "readonly",
        CustomEvent: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        navigator: "readonly"
      }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-useless-escape": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
);
