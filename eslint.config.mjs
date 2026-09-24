// Flat ESLint config: type-aware-ish safety without the slow type-checked rules,
// plus React Hooks rules (the highest-value React lint for extensions).
// Run: npm run lint:js · Fix: npx eslint . --fix
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import stylistic from "@stylistic/eslint-plugin";

export default tseslint.config(
  {
    ignores: ["node_modules/", "**/*.js", "vicinae-env.d.ts"],
  },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      // Single-statement ifs must use brackets - no bare `if (x) y();`
      curly: ["error", "all"],
      // Blank line before blocks: `const x = …;\n\nif (…) {`
      // Plus the Airbnb standard: blank line before every `return`.
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "*", next: "return" },
      ],
      // Vicinae serializes returned JSX; these are the usual noise sources.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Data fetching goes through useAsyncData (derived loading, callbacks only),
      // so synchronous setState-in-effect is a hard error, not a pattern.
      "react-hooks/set-state-in-effect": "error",
    },
  },
);
