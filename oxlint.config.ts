import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

const houseStyle: Record<string, string> = {
  eqeqeq: "== null deliberately matches both null and undefined",
  "no-eq-null": "== null deliberately matches both null and undefined",
  "no-await-in-loop":
    "sequential awaits are deliberate: paging with a cursor needs the previous page",
  "prefer-destructuring":
    "plain property reads are clearer than destructuring in these assignments",
  "require-await":
    "async keeps a function's contract (always a promise) where the body has nothing to await",
  "unicorn/consistent-function-scoping":
    "closures sit next to their only caller on purpose",
  "unicorn/import-style":
    "named imports from node: modules are the house style",
  "vitest/prefer-to-be-falsy":
    "toBe(false) asserts a real boolean, which toBeFalsy would not",
  "vitest/prefer-to-be-truthy":
    "toBe(true) asserts a real boolean, which toBeTruthy would not",
  "func-style":
    "function declarations are the house style of Better-TG-CLI: hoisted and named in stack traces",
  "no-use-before-define":
    "function declarations are hoisted; helpers live below the code that reads them",
  "vitest/max-expects": "tests check whole scenarios end to end on purpose",
  "vitest/prefer-strict-equal":
    "toEqual on plain data is intended; toStrictEqual also compares undefined fields and classes",
  "vitest/require-top-level-describe":
    "files with few tests keep them at the top level",
};

const off = (reasons: Record<string, string>) =>
  Object.fromEntries(Object.keys(reasons).map((rule) => [rule, "off"]));
const rules = off(houseStyle);

export default defineConfig({
  env: { ...core.env, browser: false, node: true },
  extends: [core, vitest],
  ignorePatterns: [...core.ignorePatterns, "dist/**", "test/probes/*/dist/**"],
  jsPlugins: ["./scripts/lint/no-comments.mjs"],
  overrides: [
    {
      files: ["**/*.test.ts"],
      plugins: ["vitest"],
      rules,
    },
  ],
  rules: { ...rules, "better-tg-cli/no-comments": "error" },
});
