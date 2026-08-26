import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Fail the build on dangerouslySetInnerHTML. This app renders two kinds
      // of attacker-reachable text: AI assistant replies, which echo
      // admin-uploaded policy documents verbatim, and free-text HR fields.
      // Interpolating either as markup was a live stored-XSS vector in the
      // chat transcript (SEC-011). If a future case genuinely needs raw HTML,
      // sanitize first and disable this rule on that single line with a
      // comment explaining why.
      "react/no-danger": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
