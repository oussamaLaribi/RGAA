import { defineConfig } from 'vitest/config';

/**
 * Per-package config so the tests run from the package directory too.
 *
 * The root config's `include` is written relative to the workspace root; from
 * inside a package it matches nothing, and vitest exits 1 on "no test files".
 * That is exactly what `nx run-many -t test` does, so without this the project's
 * own CI cannot pass while running vitest from the root looks fine.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
