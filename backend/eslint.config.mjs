import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Deliberately narrow.
 *
 * This config is not here to enforce style — it exists to make one class of
 * bug impossible to reintroduce: a promise whose rejection nobody handles.
 * That is what took the server down (an async Express handler Express never
 * awaited) and what hid the scheduler failures (a cron callback whose
 * rejection node-cron swallowed into an unlistened event).
 *
 * Type-aware rules are the only ones that can catch those, which is why this
 * uses projectService rather than the cheaper syntactic-only setup. Rules that
 * would only reformat working code are left off on purpose: a lint gate that
 * reports hundreds of cosmetic findings gets ignored, and then it catches
 * nothing.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "*.config.mjs", "*.config.ts"]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        // tsconfig.eslint.json, not the default project: tsconfig.json includes
        // only src, so every test file failed to parse with "was not found by
        // the project service" and was therefore silently unlinted.
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },

    rules: {
      // ── The rules this config exists for ──────────────────────────────
      // A promise nobody awaits or catches. `void expr` remains the explicit
      // opt-out, so intentional fire-and-forget still reads as deliberate.
      "@typescript-eslint/no-floating-promises": "error",
      // Passing an async function where a void-returning callback is expected
      // — exactly the shape of `router.get("/x", async (req, res) => ...)` and
      // `cron.schedule("...", async () => ...)`.
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "no-return-await": "error",

      // ── Correctness, not style ────────────────────────────────────────
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
      "prefer-const": "error",

      // Off deliberately. The remaining hits are all inside the language-guard
      // and sanitiser regexes, where a redundant backslash is harmless and
      // rewriting a security-relevant pattern to satisfy a cosmetic rule is a
      // worse trade than leaving it alone.
      "no-useless-escape": "off",

      // `any` appears where the Gemini SDK's request types do not model
      // systemInstruction. Worth seeing, not worth failing the build over.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },

  {
    // Tests reach into internals and deliberately provoke failures.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off"
    }
  }
);
