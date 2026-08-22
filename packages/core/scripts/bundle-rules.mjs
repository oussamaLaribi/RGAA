/**
 * Bundle the custom rules into a single script that can be dropped into a page.
 *
 * The rules are ordinary modules with imports, so unlike the axe collector they
 * cannot be serialised through `page.evaluate`. Bundling them into an IIFE that
 * exposes one global mirrors exactly how axe-core presents itself, and keeps the
 * promise that adding a rule means adding a file and nothing else.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [join(here, '../src/rules/browser-entry.ts')],
  outfile: join(here, '../dist/rules.bundle.js'),
  bundle: true,
  format: 'iife',
  // Matches the browsers the extension will target, and keeps the output
  // readable enough to inspect when a rule misbehaves in a real page.
  target: 'es2022',
  platform: 'browser',
  minify: false,
  legalComments: 'none',
  metafile: true,
});

const [output] = Object.entries(result.metafile.outputs);
console.log(`wrote ${output[0]} (${(output[1].bytes / 1024).toFixed(1)} kB)`);
