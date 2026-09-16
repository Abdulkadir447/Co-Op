import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/electron/**", "test-build/**", "public/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Underscore-prefixed locals are the intentional "unused" marker
      // (e.g. stripping immutable fields: `const { sku: _sku, ...rest } = v`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // React Compiler-era rules from react-hooks v7. The codebase predates
      // the React Compiler: its load-on-mount effects intentionally set
      // state synchronously. Enabling these is a migration work item, not a
      // one-line fix — kept off here so the lint gate stays honest
      // (it must fail on things we'd actually fix).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/scope": "off",
    },
  },
  {
    // Node-side scripts (e.g. scripts/run-tests.mjs) run outside the browser,
    // so they get Node globals and none of the React rules.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
